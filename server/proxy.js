import express from 'express';
import OpenAI from 'openai';
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';
const PORT = isProd ? (process.env.PORT || 5000) : 3001;

const app = express();

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

// ── Playwright browser singleton ────────────────────────────

function findChromium() {
  const candidates = [
    // Try shell PATH first (picks up Nix-installed chromium)
    () => execSync('which chromium', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(),
    () => execSync('which chromium-browser', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(),
    () => execSync('which google-chrome', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(),
    // Search Nix store directly as fallback
    () => execSync(
      'find /nix/store -maxdepth 4 -name "chromium" -type f 2>/dev/null | grep -v sandbox | head -1',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim(),
  ];
  for (const fn of candidates) {
    try {
      const p = fn();
      if (p) { console.log(`[playwright] Chromium found at: ${p}`); return p; }
    } catch { /* try next */ }
  }
  return null;
}

const CHROMIUM_PATH = findChromium();

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  if (!CHROMIUM_PATH) throw new Error('Chromium executable not found');
  _browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });
  console.log('[playwright] browser launched');
  return _browser;
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

process.on('exit', () => { if (_browser) _browser.close().catch(() => {}); });
process.on('SIGTERM', async () => { await closeBrowser(); process.exit(0); });
process.on('SIGINT', async () => { await closeBrowser(); process.exit(0); });

async function scrapeWithPlaywright(url) {
  const bw = await getBrowser();
  const context = await bw.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
    ignoreHTTPSErrors: true,
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 17000 });
    // Give JS-heavy pages a moment to render product data
    await page.waitForTimeout(1500);
    const html = await page.content();
    await context.close();
    return html;
  } catch (err) {
    await context.close().catch(() => {});
    throw err;
  }
}

// Verify Playwright/Chromium available on startup
getBrowser().then(() => {
  console.log('[playwright] Chromium ready');
}).catch((err) => {
  console.warn('[playwright] Chromium unavailable — bot-protected sites will require manual entry:', err.message);
});

// ── Parsing helpers ────────────────────────────────────────

function parsePrice(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return isNaN(raw) || raw <= 0 ? null : raw;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

function extractOgTag(html, property) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["'][^"']*og:${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["'][^"']*og:${property}["']`, 'i'),
    new RegExp(`<meta[^>]+property=["']product:${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']product:${property}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return m[1].trim();
  }
  return null;
}

function extractMetaName(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return m[1].trim();
  }
  return null;
}

function extractItemprop(html, prop) {
  const patterns = [
    new RegExp(`<[^>]+itemprop=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<[^>]+content=["']([^"']+)["'][^>]+itemprop=["']${prop}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return m[1].trim();
  }
  return null;
}

function parseJsonLd(html) {
  const scriptPattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const items = Array.isArray(data)
        ? data
        : data['@graph']
        ? data['@graph']
        : [data];

      for (const item of items) {
        if (typeof item !== 'object' || item === null) continue;
        const type = item['@type'];
        const typeStr = Array.isArray(type) ? type.join(' ') : String(type ?? '');
        if (!typeStr.toLowerCase().includes('product')) continue;

        const result = {};
        if (typeof item.name === 'string') result.title = item.name;
        if (typeof item.description === 'string') result.description = item.description;

        if (typeof item.sku === 'string' && item.sku.trim()) result.sku = item.sku.trim();
        else if (typeof item.mpn === 'string' && item.mpn.trim()) result.sku = item.mpn.trim();
        else if (typeof item.gtin14 === 'string') result.sku = item.gtin14.trim();
        else if (typeof item.gtin13 === 'string') result.sku = item.gtin13.trim();
        else if (typeof item.gtin12 === 'string') result.sku = item.gtin12.trim();
        else if (typeof item.gtin8 === 'string') result.sku = item.gtin8.trim();
        else if (typeof item.gtin === 'string') result.sku = item.gtin.trim();

        const img = item.image;
        if (typeof img === 'string') result.image = img;
        else if (Array.isArray(img) && img.length > 0)
          result.image = typeof img[0] === 'string' ? img[0] : img[0].url;
        else if (img && typeof img === 'object') result.image = img.url;

        const offersRaw = item.offers;
        const offers = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
        if (offers && typeof offers === 'object') {
          const p = parsePrice(offers.price);
          if (p !== null) result.price = p;
          const hp = parsePrice(offers.highPrice);
          if (hp !== null) result.highPrice = hp;
          const lp = parsePrice(offers.lowPrice);
          if (lp !== null) result.lowPrice = lp;
          if (typeof offers.availability === 'string') result.availability = offers.availability;
        }

        if (result.title || result.price !== undefined) return result;
      }
    } catch {
      // bad JSON-LD, skip
    }
  }
  return null;
}

function extractPriceFromScripts(html) {
  const scriptBlocks = [];
  const scriptPattern =
    /<script(?!\s[^>]*type=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptPattern.exec(html)) !== null) {
    if (m[1] && m[1].trim().length > 10) scriptBlocks.push(m[1]);
  }
  const sc = scriptBlocks.join('\n');

  const PRICE_PATTERNS = [
    /"(?:current_price|salePrice|finalPrice|discountedPrice|price_numeric|priceValue|sellingPrice|selling_price)"\s*:\s*"?\$?(\d{1,5}(?:\.\d{1,2})?)"?/i,
    /"price"\s*:\s*"?\$?(\d{1,5}\.\d{2})"?/,
    /"(?:price_amount|displayPrice|formattedPrice|currentPrice)"\s*:\s*"?\$?(\d{1,5}(?:\.\d{1,2})?)"?/i,
    /"price"\s*:\s*(\d{3,6})(?!\.\d)/,
    /(?:var|let|const)\s+price\s*=\s*(\d{1,5}\.\d{2})/,
    /"amount"\s*:\s*"(\d{1,5}\.\d{2})"/,
    /data-price=["'](\d{1,5}\.?\d{0,2})["']/,
  ];

  const ORIG_PATTERNS = [
    /"(?:compareAtPrice|compare_at_price|originalPrice|original_price|regularPrice|regular_price|wasPrice|listPrice|list_price|rrp)"\s*:\s*"?\$?(\d{1,5}(?:\.\d{1,2})?)"?/i,
    /"compareAtPrice"\s*:\s*(\d{3,6})(?!\.\d)/,
  ];

  let price = null;
  let originalPrice = null;

  for (const pattern of PRICE_PATTERNS) {
    const hit = pattern.exec(sc);
    if (hit) {
      let val = parseFloat(hit[1]);
      if (!isNaN(val) && val > 0) {
        if (Number.isInteger(val) && val > 99 && !hit[0].includes('.')) val = val / 100;
        if (val > 0 && val < 100000) {
          price = Math.round(val * 100) / 100;
          break;
        }
      }
    }
  }

  for (const pattern of ORIG_PATTERNS) {
    const hit = pattern.exec(sc);
    if (hit) {
      let val = parseFloat(hit[1]);
      if (!isNaN(val) && val > 0) {
        if (Number.isInteger(val) && val > 99 && !hit[0].includes('.')) val = val / 100;
        if (val > 0 && val < 100000) {
          originalPrice = Math.round(val * 100) / 100;
          break;
        }
      }
    }
  }

  return { price, originalPrice };
}

function detectOutOfStock(availabilityText) {
  const lower = (availabilityText ?? '').toLowerCase();
  const OOS = [
    'out of stock', 'out-of-stock', 'sold out', 'sold-out', 'unavailable',
    'not available', 'currently unavailable', 'temporarily unavailable',
    'no longer available', 'outofstock',
  ];
  return OOS.some((kw) => lower.includes(kw));
}

function storeFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const name = host.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
}

function isCloudflareChallenge(html) {
  return (
    html.includes('<title>Just a moment...</title>') ||
    html.includes('cf-browser-verification') ||
    html.includes('cf_chl_') ||
    html.includes('Checking your browser before accessing') ||
    html.includes('Enable JavaScript and cookies to continue') ||
    html.includes('challenge-platform')
  );
}

// ── LLM fallback ───────────────────────────────────────────

function stripHtmlToText(html) {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text.length > 6000 ? text.slice(0, 6000) : text;
}

async function llmExtractProductData(html, url) {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) return null;

  const pageText = stripHtmlToText(html);
  if (!pageText || pageText.length < 50) return null;

  const prompt = `You are a product data extractor. From the page text below (from ${url}), extract product information as JSON.

Return ONLY valid JSON with these fields (use null if not found):
{
  "title": "product name",
  "current_price": 29.99,
  "original_price": 49.99,
  "description": "short description",
  "image_url": null
}

Rules:
- current_price and original_price must be numbers (e.g. 29.99), not strings
- If there is no sale, original_price should be null
- If you see both a sale price and a "was" price, current_price = sale price, original_price = was price
- Keep description under 200 characters
- image_url: only set if you see a full https:// image URL in the text, otherwise null
- If this doesn't look like a product page, return all null values

Page text:
${pageText}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5-nano',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_completion_tokens: 300,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return {
      title: typeof parsed.title === 'string' && parsed.title ? parsed.title : null,
      current_price: typeof parsed.current_price === 'number' && parsed.current_price > 0 ? Math.round(parsed.current_price * 100) / 100 : null,
      original_price: typeof parsed.original_price === 'number' && parsed.original_price > 0 ? Math.round(parsed.original_price * 100) / 100 : null,
      description: typeof parsed.description === 'string' && parsed.description ? parsed.description : null,
      image_url: typeof parsed.image_url === 'string' && parsed.image_url.startsWith('https://') ? parsed.image_url : null,
    };
  } catch (err) {
    console.error('LLM fallback error:', err.message);
    return null;
  }
}

// ── Shared HTML → product data extractor ───────────────────

async function extractProductData(html, url) {
  let title = null;
  let current_price = null;
  let original_price = null;
  let image_url = null;
  let store_name = null;
  let description = null;
  let sku = null;
  let availabilityText = '';
  let price_source = null;

  // 1) JSON-LD
  const ld = parseJsonLd(html);
  if (ld) {
    if (ld.title) title = ld.title;
    if (ld.image) image_url = ld.image;
    if (ld.description) description = ld.description;
    if (ld.sku) sku = ld.sku;
    if (ld.price !== undefined && ld.price > 0) { current_price = ld.price; price_source = 'scraped'; }
    if (ld.highPrice !== undefined && ld.highPrice > (current_price ?? 0))
      original_price = ld.highPrice;
    if (ld.lowPrice !== undefined && current_price === null) { current_price = ld.lowPrice; price_source = 'scraped'; }
    if (ld.availability) availabilityText += ' ' + ld.availability;
  }

  // 2) Open Graph
  title = title ?? extractOgTag(html, 'title');
  image_url = image_url ?? extractOgTag(html, 'image') ?? extractOgTag(html, 'image:secure_url');
  description = description ?? extractOgTag(html, 'description') ?? extractMetaName(html, 'description');
  store_name = extractOgTag(html, 'site_name');
  sku = sku ?? extractMetaName(html, 'product:retailer_item_id') ?? extractItemprop(html, 'sku') ?? extractItemprop(html, 'mpn');

  if (!current_price) {
    const ogPrice =
      parsePrice(extractOgTag(html, 'price:amount')) ??
      parsePrice(extractMetaName(html, 'product:price:amount')) ??
      parsePrice(extractMetaName(html, 'price'));
    if (ogPrice) { current_price = ogPrice; price_source = 'scraped'; }
  }

  // 3) Microdata itemprop
  if (!current_price) {
    const mp = parsePrice(extractItemprop(html, 'price'));
    if (mp) { current_price = mp; price_source = 'scraped'; }
  }
  if (!image_url) image_url = extractItemprop(html, 'image');

  // 4) Embedded JS data
  if (!current_price) {
    const js = extractPriceFromScripts(html);
    if (js.price !== null) { current_price = js.price; price_source = 'scraped'; }
    if (js.originalPrice !== null && original_price === null) original_price = js.originalPrice;
  }

  // 5) HTML <title> fallback
  if (!title) {
    const tm = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    if (tm) title = tm[1].trim();
  }

  const ogAvail = extractOgTag(html, 'availability') ?? extractMetaName(html, 'availability');
  if (ogAvail) availabilityText += ' ' + ogAvail;

  store_name = store_name ?? storeFromUrl(url);

  // 6) LLM fallback — only when title or price is still missing
  let llmUsed = false;
  if (!title || current_price === null) {
    const llm = await llmExtractProductData(html, url);
    if (llm) {
      llmUsed = true;
      if (!title && llm.title) title = llm.title;
      if (current_price === null && llm.current_price !== null) { current_price = llm.current_price; price_source = 'scraped'; }
      if (original_price === null && llm.original_price !== null) original_price = llm.original_price;
      if (!description && llm.description) description = llm.description;
      if (!image_url && llm.image_url) image_url = llm.image_url;
    }
  }

  const is_out_of_stock = detectOutOfStock(availabilityText);
  const is_on_sale =
    current_price !== null && original_price !== null && original_price > current_price;

  if (current_price !== null) current_price = Math.round(current_price * 100) / 100;
  if (original_price !== null) original_price = Math.round(original_price * 100) / 100;

  return {
    title,
    current_price,
    original_price,
    is_on_sale,
    is_out_of_stock,
    image_url,
    store_name,
    description,
    sku,
    price_source,
    _debug: { htmlLength: html.length, hasJsonLd: ld !== null, llmUsed },
  };
}

// ── Scrape endpoint ─────────────────────────────────────────

const PLAYWRIGHT_TIMEOUT_MS = 20000;

app.get('/scrape', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url query param required' });
  }

  // Step 1: fast HTTP fetch
  let html = '';
  try {
    const response = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Referer: new URL(url).origin + '/' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    html = await response.text();
  } catch (err) {
    return res.status(502).json({ error: `Fetch failed: ${err.message}` });
  }

  if (!html || html.length < 200) {
    return res.status(502).json({ error: 'Empty or too-short response from target site' });
  }

  // Step 2: if Cloudflare challenge detected, retry with headless browser
  let usedPlaywright = false;
  if (isCloudflareChallenge(html)) {
    console.log(`[bot-protection] Cloudflare detected for ${url} — retrying with Playwright`);
    try {
      // Enforce overall timeout on the entire Playwright operation
      const playwrightHtml = await Promise.race([
        scrapeWithPlaywright(url),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Playwright timed out')), PLAYWRIGHT_TIMEOUT_MS)
        ),
      ]);
      if (isCloudflareChallenge(playwrightHtml)) {
        throw new Error('Cloudflare challenge persists even in headless browser');
      }
      console.log(`[playwright] rendered ${playwrightHtml.length} bytes for ${url}`);
      html = playwrightHtml;
      usedPlaywright = true;
    } catch (err) {
      console.warn(`[playwright] failed for ${url}: ${err.message}`);
      return res.status(403).json({
        error: 'bot_protection',
        message: 'This site blocks automated access. Please enter the product details manually.',
        store_name: storeFromUrl(url),
        _debug: { blocked: true, reason: 'cloudflare', playwrightError: err.message },
      });
    }
  }

  // Step 3: extract product data from the HTML (with LLM fallback)
  const result = await extractProductData(html, url);

  // Step 4: if Playwright rendered the page but we still couldn't extract
  // meaningful product data, fall back to the manual-entry banner
  if (usedPlaywright && !result.title && !result.image_url) {
    console.warn(`[playwright] rendered but no product data found for ${url}`);
    return res.status(403).json({
      error: 'bot_protection',
      message: 'This site blocks automated access. Please enter the product details manually.',
      store_name: storeFromUrl(url),
      _debug: { blocked: true, reason: 'no_data_after_playwright' },
    });
  }

  res.json(result);
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/delete-account', async (req, res) => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: 'Account deletion not configured on server — add SUPABASE_SERVICE_ROLE_KEY secret' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  try {
    const token = authHeader.slice(7);
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey || '' },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
    const { id: userId } = await userRes.json();

    const deleteRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });

    if (!deleteRes.ok) {
      const err = await deleteRes.json().catch(() => ({}));
      return res.status(deleteRes.status).json({ error: err.message || 'Auth user deletion failed' });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Production: serve built frontend ───────────────────────
if (isProd) {
  const distPath = join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(join(distPath, 'index.html'));
    });
    console.log(`[prod] Serving static files from ${distPath}`);
  } else {
    console.warn('[prod] dist/ not found — run npm run build first');
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`${isProd ? 'Production server' : 'Scrape proxy'} running on http://localhost:${PORT}`);
});
