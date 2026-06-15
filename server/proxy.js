import express from 'express';
import OpenAI from 'openai';
import { chromium as chromiumCore } from 'playwright-core';
import { chromium as chromiumExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Impit } from 'impit';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';
const PORT = isProd ? (process.env.PORT || 5000) : 3001;

const app = express();

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

const openai = OPENAI_API_KEY
  ? new OpenAI({
      apiKey: OPENAI_API_KEY,
      ...(OPENAI_BASE_URL ? { baseURL: OPENAI_BASE_URL } : {}),
    })
  : null;

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

/** Strip stray trailing ":" from a URL (bad redirects, copy/paste). Never removes ":" from "https://". */
function normalizeScrapeUrl(href) {
  const s = String(href ?? '').trim();
  if (!s) return s;
  let out = s;
  while (out.endsWith(':')) {
    if (out.endsWith('://')) break;
    out = out.slice(0, -1).trimEnd();
  }
  return out;
}

/** Trim trailing slashes / colons from RESIDENTIAL_PROXY_URL (e.g. …cloudflared.app: from env). */
function normalizeResidentialProxyBase(raw) {
  if (raw == null || typeof raw !== 'string') return raw;
  return raw.trim().replace(/\/+$/, '').replace(/:+$/, '');
}

/** First path segment like `en-au` → `en-AU,en;q=0.9` (helps LEGO / regional Akamai). */
function inferAcceptLanguageFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    // Paths like /product/... (no /en-au/) — still AU retail
    if (host.endsWith('.com.au')) {
      return 'en-AU,en;q=0.9,en-US;q=0.8';
    }
    const first = u.pathname.split('/').filter(Boolean)[0] || '';
    const m = /^([a-z]{2})-([a-z]{2})$/i.exec(first);
    if (m) {
      const tag = `${m[1].toLowerCase()}-${m[2].toUpperCase()}`;
      return `${tag},${m[1].toLowerCase()};q=0.9,en;q=0.8`;
    }
  } catch {
    /* ignore */
  }
  return BROWSER_HEADERS['Accept-Language'];
}

function inferPlaywrightLocale(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.hostname.toLowerCase().endsWith('.com.au')) return 'en-AU';
    const first = u.pathname.split('/').filter(Boolean)[0] || '';
    const m = /^([a-z]{2})-([a-z]{2})$/i.exec(first);
    if (m) return `${m[1].toLowerCase()}-${m[2].toUpperCase()}`;
  } catch {
    /* ignore */
  }
  return 'en-US';
}

function inferPlaywrightTimezone(urlStr) {
  const loc = inferPlaywrightLocale(urlStr);
  if (loc === 'en-AU') return 'Australia/Sydney';
  if (loc === 'en-GB' || loc === 'en-UK') return 'Europe/London';
  if (loc === 'en-NZ') return 'Pacific/Auckland';
  return 'America/New_York';
}

function buildBrowserHeadersForUrl(urlStr) {
  return {
    ...BROWSER_HEADERS,
    'Accept-Language': inferAcceptLanguageFromUrl(urlStr),
  };
}

let impitClient;
function getImpitClient() {
  if (!impitClient) {
    impitClient = new Impit({ browser: 'chrome' });
  }
  return impitClient;
}

/**
 * HTTP fetch that mimics real Chrome (header ordering, h2 frame order, TLS fingerprints)
 * via impit, which is significantly harder for CDNs to fingerprint than Node `fetch`.
 * Falls back to native fetch if impit fails for any reason.
 */
async function fetchHtmlImpersonated(url, { timeoutMs = 15_000 } = {}) {
  try {
    const response = await getImpitClient().fetch(url, {
      headers: {
        'Accept-Language': inferAcceptLanguageFromUrl(url),
        Referer: new URL(url).origin + '/',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    return { status: response.status, body };
  } catch (impitErr) {
    console.warn(`[fetch] impit failed (${impitErr.message}); falling back to node fetch`);
    const response = await fetch(url, {
      headers: { ...buildBrowserHeadersForUrl(url), Referer: new URL(url).origin + '/' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    return { status: response.status, body };
  }
}

// ── Playwright browser singleton ────────────────────────────

function findChromium() {
  const fromEnv = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    process.env.CHROMIUM_PATH,
    process.env.CHROME_PATH,
  ].find((candidate) => candidate && fs.existsSync(candidate));
  if (fromEnv) {
    console.log(`[playwright] Chromium from env: ${fromEnv}`);
    return fromEnv;
  }

  if (process.platform === 'win32') {
    const windowsCandidates = [
      process.env['PROGRAMFILES'] ? `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe` : null,
      process.env['PROGRAMFILES(X86)'] ? `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe` : null,
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
      process.env['PROGRAMFILES'] ? `${process.env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe` : null,
      process.env['PROGRAMFILES(X86)'] ? `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe` : null,
    ].filter(Boolean);

    for (const candidate of windowsCandidates) {
      if (fs.existsSync(candidate)) {
        console.log(`[playwright] Chromium found at: ${candidate}`);
        return candidate;
      }
    }

    try {
      const whereChrome = execSync('where chrome', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
        .split(/\r?\n/)
        .find(Boolean)
        ?.trim();
      if (whereChrome) {
        console.log(`[playwright] Chromium found at: ${whereChrome}`);
        return whereChrome;
      }
    } catch {
      // ignore
    }
  }

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

chromiumExtra.use(StealthPlugin());

let _browser = null;
let _browserLaunchPromise = null;
const BROWSER_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-gpu-compositing',
  '--disable-software-rasterizer',
  '--disable-gpu-sandbox',
  '--no-first-run',
  '--no-zygote',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process,UseOzonePlatform',
];

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  if (_browserLaunchPromise) return _browserLaunchPromise;
  _browser = null;

  const attempts = [
    ...(CHROMIUM_PATH
      ? [{
          label: `executablePath (${CHROMIUM_PATH})`,
          launcher: chromiumExtra,
          options: { executablePath: CHROMIUM_PATH, headless: true, args: BROWSER_LAUNCH_ARGS },
        }]
      : []),
    ...(process.platform === 'win32'
      ? [{
          label: 'chrome channel',
          launcher: chromiumExtra,
          options: { channel: 'chrome', headless: true, args: BROWSER_LAUNCH_ARGS },
        }]
      : []),
    {
      label: 'playwright default',
      launcher: chromiumCore,
      options: { headless: true, args: BROWSER_LAUNCH_ARGS },
    },
  ];

  _browserLaunchPromise = (async () => {
    let lastError = null;
    for (const attempt of attempts) {
      try {
        const bw = await attempt.launcher.launch(attempt.options);
        console.log(`[playwright] launch success via ${attempt.label}`);
        return bw;
      } catch (err) {
        lastError = err;
        console.warn(`[playwright] launch failed via ${attempt.label}: ${err.message}`);
      }
    }
    throw lastError || new Error('Chromium executable not found');
  })().then((bw) => {
    _browser = bw;
    _browserLaunchPromise = null;
    console.log('[playwright] browser launched');
    bw.on('disconnected', () => {
      console.warn('[playwright] browser disconnected — will relaunch on next request');
      _browser = null;
    });
    return bw;
  }).catch((err) => {
    _browserLaunchPromise = null;
    _browser = null;
    throw err;
  });
  return _browserLaunchPromise;
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

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1';

async function scrapeWithPlaywright(url, { variant = 'desktop' } = {}) {
  const bw = await getBrowser();
  const h = buildBrowserHeadersForUrl(url);
  const isMobile = variant === 'mobile';
  const context = await bw.newContext({
    userAgent: isMobile ? MOBILE_UA : h['User-Agent'],
    viewport: isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: isMobile ? 3 : 1,
    isMobile: isMobile,
    hasTouch: isMobile,
    locale: inferPlaywrightLocale(url),
    timezoneId: inferPlaywrightTimezone(url),
    extraHTTPHeaders: isMobile
      ? {
          Accept: h.Accept,
          'Accept-Language': h['Accept-Language'],
        }
      : {
          Accept: h.Accept,
          'Accept-Language': h['Accept-Language'],
          'sec-ch-ua': h['Sec-Ch-Ua'],
          'sec-ch-ua-mobile': h['Sec-Ch-Ua-Mobile'],
          'sec-ch-ua-platform': h['Sec-Ch-Ua-Platform'],
        },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  try {
    // Origin warm-up: visit the homepage first so cookies + challenge tokens land before the PDP.
    try {
      const origin = new URL(url).origin + '/';
      if (origin !== url) {
        await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await new Promise((r) => setTimeout(r, 800));
      }
    } catch (_) {
      // Warm-up is best-effort — proceed to PDP regardless
    }

    // Navigate — luxury / big retail PDPs often need >25s on cold instances
    await page.goto(url, { waitUntil: 'load', timeout: 55_000 });

    // Small human-ish movement to defeat naive automation heuristics
    try {
      await page.mouse.move(200, 200);
      await page.mouse.move(500, 400, { steps: 6 });
      await page.evaluate(() => window.scrollBy(0, 300));
    } catch (_) {
      // ignore
    }

    // For SPA sites: wait for network to settle, with a cap
    try {
      await page.waitForLoadState('networkidle', { timeout: 18_000 });
    } catch (_) {
      // networkidle timeout is okay — content may still be ready
    }

    // Try to wait for meaningful content — h1 or a JSON-LD script
    try {
      await page.waitForSelector('h1, [data-testid], script[type="application/ld+json"]', { timeout: 12_000 });
    } catch (_) {
      // If no recognisable selector appears, fall through with whatever rendered
    }

    // Give any late async data fetches one final moment
    await new Promise((r) => setTimeout(r, 2500));

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

        // Schema.org ProductGroup (e.g. Nike AU): root has no offers; each size variant has Offer.price
        if (
          typeStr.toLowerCase().includes('productgroup') &&
          Array.isArray(item.hasVariant)
        ) {
          let maxVariantPrice = null;
          let variantImage = null;
          for (const v of item.hasVariant) {
            if (!v || typeof v !== 'object') continue;
            const vo = v.offers;
            if (vo && typeof vo === 'object') {
              const vp = parsePrice(vo.price);
              if (vp !== null && vp > 0) {
                maxVariantPrice =
                  maxVariantPrice === null ? vp : Math.max(maxVariantPrice, vp);
              }
            }
            if (!variantImage && typeof v.image === 'string') variantImage = v.image;
            else if (!variantImage && v.image && typeof v.image === 'object' && v.image.url)
              variantImage = v.image.url;
          }
          if (maxVariantPrice !== null) result.price = maxVariantPrice;
          if (!result.image && variantImage) result.image = variantImage;
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
      const val = parseFloat(hit[1]);
      if (!isNaN(val) && val > 0 && val < 100000) {
        // Do not divide whole integers by 100: many PDPs (e.g. Nike) use dollars as 320 meaning $320,
        // not cents. Prefer JSON-LD / meta prices; script regexes are best-effort only.
        price = Math.round(val * 100) / 100;
        break;
      }
    }
  }

  for (const pattern of ORIG_PATTERNS) {
    const hit = pattern.exec(sc);
    if (hit) {
      const val = parseFloat(hit[1]);
      if (!isNaN(val) && val > 0 && val < 100000) {
        originalPrice = Math.round(val * 100) / 100;
        break;
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

// Used to decide whether to even try Playwright (initial HTTP fetch result)
function isBotProtected(html, httpStatus) {
  if (httpStatus === 403 || httpStatus === 401 || httpStatus === 503) return true;
  // Do not use html.includes('captcha') — it matches "reCAPTCHA" on normal retail PDPs and forces Playwright/Pi every time.
  const h = html.toLowerCase();
  const sansRecaptcha = h.replace(/recaptcha/gi, '');
  const captchaWall =
    sansRecaptcha.includes('hcaptcha') ||
    /\bvisual\s*captcha\b/i.test(html) ||
    /\bplease\s+complete\s+(the\s+)?captcha\b/i.test(h);
  return (
    // Cloudflare
    html.includes('<title>Just a moment...</title>') ||
    html.includes('cf-browser-verification') ||
    html.includes('cf_chl_') ||
    html.includes('Checking your browser before accessing') ||
    html.includes('Enable JavaScript and cookies to continue') ||
    html.includes('challenge-platform') ||
    // Akamai / EdgeSuite — only flag as blocked if it looks like an Access Denied page
    // (not just a reference to edgesuite.net as a CDN asset URL)
    (html.includes('edgesuite.net') && html.includes('Access Denied') && html.length < 5000) ||
    (html.includes('Reference&#32;&#35;') && html.includes('Access Denied')) ||
    captchaWall
  );
}

/**
 * Many luxury / SPA PDPs return HTTP 200 + marketing HTML without a challenge string,
 * so isBotProtected stays false — but price/product only appear after JS. If we already
 * have structured price in the static HTML, skip the expensive browser path.
 */
function shallowHtmlMissingProductPrice(html) {
  const ld = parseJsonLd(html);
  if (ld && ld.price !== undefined && ld.price !== null && ld.price > 0) return false;

  const metaPrice =
    parsePrice(extractOgTag(html, 'price:amount')) ??
    parsePrice(extractMetaName(html, 'product:price:amount')) ??
    parsePrice(extractMetaName(html, 'price'));
  if (metaPrice) return false;

  const itempropPrice = parsePrice(extractItemprop(html, 'price'));
  if (itempropPrice) return false;

  const js = extractPriceFromScripts(html);
  if (js.price !== null) return false;

  const hasProductHint =
    !!extractOgTag(html, 'title') ||
    !!extractOgTag(html, 'image') ||
    !!(ld && ld.title) ||
    html.length > 25000;

  return hasProductHint;
}

// Stricter check used ONLY on the Playwright-rendered result.
// edgesuite.net is a legitimate Akamai CDN so is present on real Target pages — don't flag it.
function isStillBotBlocked(html) {
  return (
    html.includes('<title>Just a moment...</title>') ||
    html.includes('cf-browser-verification') ||
    html.includes('cf_chl_') ||
    html.includes('Enable JavaScript and cookies to continue') ||
    (html.includes('Access Denied') && html.includes('permission to access') && html.length < 5000) ||
    html.length < 1000
  );
}

/** True if HTML still looks like a real PDP (avoid throwing away Pi HTML on overly strict bot heuristics). */
function hasLikelyProductPageHtml(html) {
  const ld = parseJsonLd(html);
  if (ld && (ld.title || (ld.price !== undefined && ld.price !== null && ld.price > 0))) return true;
  if (extractOgTag(html, 'title') && html.length > 12_000) return true;
  if (/["']@type["']\s*:\s*["'][^"']*Product[^"']*["']/i.test(html) && html.length > 8000) return true;
  return false;
}

// ── Residential Pi proxy ────────────────────────────────────

async function scrapeWithResidentialProxy(url) {
  const proxyUrl = normalizeResidentialProxyBase(process.env.RESIDENTIAL_PROXY_URL);
  const proxyKey = process.env.RESIDENTIAL_PROXY_KEY;
  if (!proxyUrl || !proxyKey) {
    throw new Error('Residential proxy not configured');
  }
  const endpoint = `${proxyUrl}/fetch?url=${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${proxyKey}` },
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) {
    throw new Error(`Pi proxy returned HTTP ${response.status}`);
  }
  return response.text();
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
  if (!openai) return null;

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

// ── Link metadata (recipes, videos, articles) ───────────────

function parseDurationIso8601(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i.exec(raw);
  if (!m) return raw;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (min) parts.push(`${min}m`);
  if (s && !h && !min) parts.push(`${s}s`);
  return parts.join(' ') || null;
}

function parseJsonLdForLink(html) {
  const scriptPattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  const linkTypes = [
    'recipe',
    'videoobject',
    'article',
    'newsarticle',
    'blogposting',
    'webpage',
    'softwareapplication',
  ];
  while ((match = scriptPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const items = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
      for (const item of items) {
        if (typeof item !== 'object' || item === null) continue;
        const type = item['@type'];
        const typeStr = (Array.isArray(type) ? type.join(' ') : String(type ?? '')).toLowerCase();
        if (!linkTypes.some((t) => typeStr.includes(t))) continue;

        const result = { metadata: {} };
        if (typeof item.name === 'string') result.title = item.name;
        if (typeof item.headline === 'string') result.title = item.headline;
        if (typeof item.description === 'string') result.description = item.description;

        const img = item.image;
        if (typeof img === 'string') result.image_url = img;
        else if (Array.isArray(img) && img.length > 0)
          result.image_url = typeof img[0] === 'string' ? img[0] : img[0]?.url;
        else if (img && typeof img === 'object') result.image_url = img.url;

        if (typeStr.includes('recipe')) {
          result.link_type = 'recipe';
          if (Array.isArray(item.recipeIngredient))
            result.metadata.ingredients = item.recipeIngredient.filter((x) => typeof x === 'string');
          const cook = item.cookTime || item.prepTime;
          if (cook) result.metadata.cook_time_minutes = parseDurationMinutes(cook);
          if (item.totalTime) result.metadata.total_time_minutes = parseDurationMinutes(item.totalTime);
          if (item.recipeYield) result.metadata.servings = String(item.recipeYield);
          if (item.recipeCuisine) result.metadata.cuisine = String(item.recipeCuisine);
        } else if (typeStr.includes('video')) {
          result.link_type = 'video';
          if (item.uploadDate) result.metadata.published_at = String(item.uploadDate);
          if (item.duration) result.metadata.duration = parseDurationIso8601(String(item.duration));
          const author = item.author;
          if (typeof author === 'string') result.metadata.creator = author;
          else if (author && typeof author === 'object' && author.name)
            result.metadata.creator = String(author.name);
          if (item.embedUrl) result.metadata.embed_url = String(item.embedUrl);
        } else if (typeStr.includes('article') || typeStr.includes('blog')) {
          result.link_type = 'article';
          const author = item.author;
          if (typeof author === 'string') result.metadata.author = author;
          else if (author && typeof author === 'object' && author.name)
            result.metadata.author = String(author.name);
          if (item.datePublished) result.metadata.published_at = String(item.datePublished);
        } else if (typeStr.includes('software')) {
          result.link_type = 'tool';
        }

        if (result.title || result.image_url) return result;
      }
    } catch {
      /* next script */
    }
  }
  return null;
}

function parseDurationMinutes(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/i.exec(iso);
  if (!m) return null;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  return h * 60 + min || null;
}

function extractCanonicalUrl(html, fallbackUrl) {
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) {
      try {
        return new URL(m[1].trim(), fallbackUrl).href;
      } catch {
        return m[1].trim();
      }
    }
  }
  return fallbackUrl;
}

function detectLinkPlatform(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('pinterest.')) return 'Pinterest';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'X';
    if (host.includes('reddit.com')) return 'Reddit';
    if (host.includes('facebook.com')) return 'Facebook';
    return null;
  } catch {
    return null;
  }
}

function getYouTubeVideoId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) return u.pathname.split('/').filter(Boolean)[0] || null;
    if (host.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/').filter(Boolean)[1] || null;
      return u.searchParams.get('v');
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchYouTubeOembed(url) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      url,
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      title: typeof data.title === 'string' ? data.title : null,
      description: null,
      image_url:
        typeof data.thumbnail_url === 'string'
          ? data.thumbnail_url
          : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      site_name: 'YouTube',
      favicon_url: 'https://www.youtube.com/s/desktop/favicon.ico',
      link_type: 'video',
      metadata: {
        platform: 'YouTube',
        creator: typeof data.author_name === 'string' ? data.author_name : null,
        embed_url: `https://www.youtube.com/embed/${videoId}`,
      },
      _debug: { source: 'youtube_oembed' },
    };
  } catch {
    return null;
  }
}

function detectLinkTypeFromSignals(url, ogType, ldType) {
  if (ldType) return ldType;
  const platform = detectLinkPlatform(url);
  if (platform) return 'video';
  const og = (ogType || '').toLowerCase();
  if (og.includes('video')) return 'video';
  if (og.includes('article')) return 'article';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/recipe|allrecipes|foodnetwork|bonappetit|seriouseats|tasty|delish/.test(host))
      return 'recipe';
  } catch {
    /* ignore */
  }
  return 'other';
}

function shallowHtmlMissingLinkMetadata(html) {
  return (
    !extractOgTag(html, 'title') &&
    !extractMetaName(html, 'twitter:title') &&
    !/<title[^>]*>[^<]+<\/title>/i.test(html)
  );
}

async function extractLinkData(html, url) {
  const ld = parseJsonLdForLink(html);
  let title = ld?.title ?? null;
  let description = ld?.description ?? null;
  let image_url = ld?.image_url ?? null;
  let link_type = ld?.link_type ?? null;
  const metadata = { ...(ld?.metadata ?? {}) };

  title =
    title ??
    extractOgTag(html, 'title') ??
    extractMetaName(html, 'twitter:title');
  description =
    description ??
    extractOgTag(html, 'description') ??
    extractMetaName(html, 'description') ??
    extractMetaName(html, 'twitter:description');
  image_url =
    image_url ??
    extractOgTag(html, 'image') ??
    extractOgTag(html, 'image:secure_url') ??
    extractMetaName(html, 'twitter:image');

  const site_name = extractOgTag(html, 'site_name') ?? storeFromUrl(url);
  const ogType = extractOgTag(html, 'type');
  link_type = detectLinkTypeFromSignals(url, ogType, link_type);

  const platform = detectLinkPlatform(url);
  if (platform && !metadata.platform) metadata.platform = platform;

  if (!title) {
    const tm = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    if (tm) title = tm[1].trim().replace(/\s*[-|·]\s*[^-|·]+$/, '').trim() || tm[1].trim();
  }

  let favicon_url = null;
  const favMatch =
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i.exec(html) ||
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i.exec(html);
  if (favMatch) {
    try {
      favicon_url = new URL(favMatch[1].trim(), url).href;
    } catch {
      favicon_url = favMatch[1].trim();
    }
  }

  const canonical_url = extractCanonicalUrl(html, url);

  return {
    url,
    canonical_url,
    title,
    description,
    image_url,
    site_name,
    favicon_url,
    link_type: link_type || 'other',
    metadata,
    _debug: { htmlLength: html.length, hasJsonLd: ld !== null },
  };
}

// ── Scrape endpoint ─────────────────────────────────────────

/** Outer cap for scrapeWithPlaywright (must exceed goto + networkidle + selector waits). */
const PLAYWRIGHT_TIMEOUT_MS = Math.min(
  120_000,
  Math.max(25_000, Number.parseInt(process.env.PLAYWRIGHT_TIMEOUT_MS || '', 10) || 65_000)
);

app.get(['/scrape', '/api/scrape'], async (req, res) => {
  const rawUrl = req.query.url;
  if (rawUrl == null || typeof rawUrl !== 'string' || !String(rawUrl).trim()) {
    return res.status(400).json({ error: 'url query param required' });
  }
  const url = normalizeScrapeUrl(rawUrl);
  if (!url) {
    return res.status(400).json({ error: 'url query param required' });
  }

  // Step 1: fast HTTP fetch (Chrome-like TLS/header ordering via impit)
  let html = '';
  let httpStatus = 200;
  try {
    const r = await fetchHtmlImpersonated(url);
    httpStatus = r.status;
    html = r.body;
  } catch (err) {
    return res.status(502).json({ error: `Fetch failed: ${err.message}` });
  }

  if (!html || html.length < 200) {
    return res.status(502).json({ error: 'Empty or too-short response from target site' });
  }

  // Step 1b: datacenter 401/403 — try residential HTML before Playwright (LEGO AU, etc.)
  const resiConfigured =
    !!normalizeResidentialProxyBase(process.env.RESIDENTIAL_PROXY_URL) &&
    !!process.env.RESIDENTIAL_PROXY_KEY;
  let skipPlaywright = false;
  if (
    resiConfigured &&
    (httpStatus === 403 || httpStatus === 401) &&
    isBotProtected(html, httpStatus)
  ) {
    console.log(`[pi-proxy] HTTP ${httpStatus} from datacenter — trying residential fetch before Playwright`);
    try {
      const piHtml = await scrapeWithResidentialProxy(url);
      if (!isStillBotBlocked(piHtml) || hasLikelyProductPageHtml(piHtml)) {
        console.log(`[pi-proxy] early residential OK (${piHtml.length} bytes)`);
        html = piHtml;
        skipPlaywright = true;
      }
    } catch (earlyErr) {
      console.warn(`[pi-proxy] early residential: ${earlyErr.message}`);
    }
  }

  // Step 2: if bot protection detected — or static HTML has no usable price (common SPA/luxury PDPs) — use Playwright (+ Pi fallback)
  let usedPlaywright = false;
  const botWall = isBotProtected(html, httpStatus);
  const sparsePrice = !botWall && shallowHtmlMissingProductPrice(html);
  if (!skipPlaywright && (botWall || sparsePrice)) {
    if (botWall) {
      console.log(`[bot-protection] Detected for ${url} (status ${httpStatus}) — retrying with Playwright`);
    } else {
      console.log(`[scrape] No product price in static HTML for ${url} — retrying with Playwright`);
    }
    const runPlaywrightVariant = (variant) =>
      Promise.race([
        scrapeWithPlaywright(url, { variant }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Playwright timed out')), PLAYWRIGHT_TIMEOUT_MS)
        ),
      ]);
    try {
      let playwrightHtml = await runPlaywrightVariant('desktop');
      if (isStillBotBlocked(playwrightHtml) && !hasLikelyProductPageHtml(playwrightHtml)) {
        console.log(`[playwright] desktop looked blocked — retrying with mobile profile`);
        try {
          const mobileHtml = await runPlaywrightVariant('mobile');
          if (!isStillBotBlocked(mobileHtml) || hasLikelyProductPageHtml(mobileHtml)) {
            playwrightHtml = mobileHtml;
          } else {
            throw new Error('Bot protection persists even in headless browser');
          }
        } catch (mobileErr) {
          throw new Error(mobileErr.message || 'Mobile Playwright retry failed');
        }
      }
      console.log(`[playwright] rendered ${playwrightHtml.length} bytes for ${url}`);
      html = playwrightHtml;
      usedPlaywright = true;
    } catch (playwrightErr) {
      console.warn(`[playwright] failed for ${url}: ${playwrightErr.message}`);

      // Step 2b: Pi residential proxy fallback (only when RESIDENTIAL_PROXY_URL is set)
      const proxyUrl = normalizeResidentialProxyBase(process.env.RESIDENTIAL_PROXY_URL);
      if (proxyUrl) {
        console.log(`[pi-proxy] Attempting residential proxy for ${url}`);
        try {
          const piHtml = await scrapeWithResidentialProxy(url);
          if (isStillBotBlocked(piHtml) && !hasLikelyProductPageHtml(piHtml)) {
            throw new Error('Bot protection persists even through residential proxy');
          }
          console.log(`[pi-proxy] rendered ${piHtml.length} bytes for ${url}`);
          html = piHtml;
        } catch (piErr) {
          console.warn(`[pi-proxy] failed for ${url}: ${piErr.message}`);
          return res.status(403).json({
            error: 'bot_protection',
            message: 'This site blocks automated access. Please enter the product details manually.',
            store_name: storeFromUrl(url),
            _debug: { blocked: true, reason: 'cloudflare', playwrightError: playwrightErr.message, piProxyError: piErr.message },
          });
        }
      } else {
        return res.status(403).json({
          error: 'bot_protection',
          message: 'This site blocks automated access. Please enter the product details manually.',
          store_name: storeFromUrl(url),
          _debug: { blocked: true, reason: 'cloudflare', playwrightError: playwrightErr.message },
        });
      }
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

app.get(['/scrape-link', '/api/scrape-link'], async (req, res) => {
  const rawUrl = req.query.url;
  if (rawUrl == null || typeof rawUrl !== 'string' || !String(rawUrl).trim()) {
    return res.status(400).json({ error: 'url query param required' });
  }
  const url = normalizeScrapeUrl(rawUrl);
  if (!url) {
    return res.status(400).json({ error: 'url query param required' });
  }

  const youtubeResult = await fetchYouTubeOembed(url);
  if (youtubeResult) return res.json(youtubeResult);

  let html = '';
  let httpStatus = 200;
  try {
    const r = await fetchHtmlImpersonated(url);
    httpStatus = r.status;
    html = r.body;
  } catch (err) {
    return res.status(502).json({ error: `Fetch failed: ${err.message}` });
  }

  if (!html || html.length < 200) {
    return res.status(502).json({ error: 'Empty or too-short response from target site' });
  }

  const botWall = isBotProtected(html, httpStatus);
  const missingMeta = !botWall && shallowHtmlMissingLinkMetadata(html) && !extractOgTag(html, 'image');

  if (botWall || missingMeta) {
    console.log(
      `[scrape-link] ${botWall ? 'bot wall' : 'sparse metadata'} for ${url} — trying Playwright`
    );
    try {
      const playwrightHtml = await Promise.race([
        scrapeWithPlaywright(url, { variant: 'desktop' }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Playwright timed out')), PLAYWRIGHT_TIMEOUT_MS)
        ),
      ]);
      if (playwrightHtml && playwrightHtml.length > 200) html = playwrightHtml;
    } catch (err) {
      console.warn(`[scrape-link] Playwright failed: ${err.message}`);
    }
  }

  const result = await extractLinkData(html, url);
  if (!result.title && !result.image_url) {
    result.title = storeFromUrl(url) || url;
    result.link_type = detectLinkTypeFromSignals(url, null, result.link_type);
  }
  res.json(result);
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get(['/playwright-status', '/api/playwright-status'], (_req, res) => {
  res.json({
    ready: !!(_browser && _browser.isConnected()),
    launching: !!_browserLaunchPromise,
  });
});

app.get(['/proxy-status', '/api/proxy-status'], async (_req, res) => {
  const proxyUrl = normalizeResidentialProxyBase(process.env.RESIDENTIAL_PROXY_URL);
  if (!proxyUrl) {
    return res.json({ configured: false, reachable: false });
  }
  try {
    const response = await fetch(`${proxyUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    res.json({ configured: true, reachable: response.ok });
  } catch {
    res.json({ configured: true, reachable: false });
  }
});

// ── Production: serve built frontend ───────────────────────
if (isProd) {
  const distPath = join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, { index: 'index.html' }));
    app.use((_req, res) => {
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
