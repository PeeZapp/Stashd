import express from 'express';
import OpenAI from 'openai';

const app = express();
const PORT = 3001;

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
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

        // SKU / identifiers
        if (typeof item.sku === 'string' && item.sku.trim()) result.sku = item.sku.trim();
        else if (typeof item.mpn === 'string' && item.mpn.trim()) result.sku = item.mpn.trim();
        else if (typeof item.gtin14 === 'string') result.sku = item.gtin14.trim();
        else if (typeof item.gtin13 === 'string') result.sku = item.gtin13.trim();
        else if (typeof item.gtin12 === 'string') result.sku = item.gtin12.trim();
        else if (typeof item.gtin8 === 'string') result.sku = item.gtin8.trim();
        else if (typeof item.gtin === 'string') result.sku = item.gtin.trim();

        // Image
        const img = item.image;
        if (typeof img === 'string') result.image = img;
        else if (Array.isArray(img) && img.length > 0)
          result.image = typeof img[0] === 'string' ? img[0] : img[0].url;
        else if (img && typeof img === 'object') result.image = img.url;

        // Offers
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

function queryFromUrl(url) {
  try {
    const u = new URL(url);
    // Get the last non-empty path segment and convert slug to words
    const segments = u.pathname.split('/').filter(Boolean);
    const slug = segments[segments.length - 1] ?? '';
    return slug.replace(/[-_]+/g, ' ').replace(/\d{5,}/g, '').trim() || null;
  } catch {
    return null;
  }
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

// ── LLM fallback ───────────────────────────────────────────

function stripHtmlToText(html) {
  // Remove script, style, svg, nav, footer blocks entirely
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')           // Strip remaining tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, ' ')            // Collapse whitespace
    .trim();

  // Limit to ~6000 chars to keep token cost low
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

// ── eBay Finding API ───────────────────────────────────────

async function searchEbay(query, sku) {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) return null;

  // Prefer SKU/UPC search if we have a numeric identifier (GTIN/UPC)
  const isNumericId = sku && /^\d{8,14}$/.test(sku.replace(/-/g, ''));
  const keywords = isNumericId ? sku : query;

  const params = new URLSearchParams({
    'OPERATION-NAME': 'findItemsByKeywords',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': appId,
    'RESPONSE-DATA-FORMAT': 'JSON',
    keywords,
    'paginationInput.entriesPerPage': '10',
    'itemFilter(0).name': 'ListingType',
    'itemFilter(0).value(0)': 'FixedPrice',
    'itemFilter(0).value(1)': 'StoreInventory',
    'itemFilter(1).name': 'Condition',
    'itemFilter(1).value': 'New',
    sortOrder: 'PricePlusShippingLowest',
  });

  try {
    const res = await fetch(
      `https://svcs.ebay.com/services/search/FindingService/v1?${params}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const json = await res.json();
    const items =
      json?.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item ?? [];

    if (!items.length) return null;

    // Pick the lowest priced new item
    let bestItem = null;
    let bestPrice = Infinity;
    for (const item of items) {
      const raw = item?.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'];
      const price = raw ? parseFloat(raw) : null;
      if (price && price > 0 && price < bestPrice) {
        bestPrice = price;
        bestItem = item;
      }
    }

    if (!bestItem) return null;

    return {
      price: Math.round(bestPrice * 100) / 100,
      title: bestItem?.title?.[0] ?? null,
      image: bestItem?.galleryURL?.[0] ?? null,
    };
  } catch {
    return null;
  }
}

async function searchEbayPrice(query, sku) {
  const result = await searchEbay(query, sku);
  return result ? result.price : null;
}

// ── Scrape endpoint ─────────────────────────────────────────

app.get('/scrape', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url query param required' });
  }

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

  // Detect Cloudflare / bot-protection challenge pages
  const isCloudflareChallenge =
    html.includes('<title>Just a moment...</title>') ||
    html.includes('cf-browser-verification') ||
    html.includes('cf_chl_') ||
    html.includes('Checking your browser before accessing') ||
    html.includes('Enable JavaScript and cookies to continue') ||
    html.includes('challenge-platform');

  if (isCloudflareChallenge) {
    const storeName = storeFromUrl(url);
    const urlQuery = queryFromUrl(url);
    const ebayQuery = [storeName, urlQuery].filter(Boolean).join(' ');
    const ebay = ebayQuery ? await searchEbay(ebayQuery, null) : null;

    return res.status(403).json({
      error: 'bot_protection',
      message: "This site blocks automated access. Details below are sourced from eBay listings and may not be 100% accurate.",
      store_name: storeName,
      title: ebay?.title ?? null,
      current_price: ebay?.price ?? null,
      image_url: ebay?.image ?? null,
      price_source: ebay?.price ? 'ebay' : null,
      ebay_assisted: true,
      _debug: { blocked: true, reason: 'cloudflare', ebayFound: !!ebay },
    });
  }

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

  res.json({
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
  });
});

// ── eBay price lookup endpoint ─────────────────────────────

app.get('/ebay-price', async (req, res) => {
  const { query, sku } = req.query;
  if (!query && !sku) {
    return res.status(400).json({ error: 'query or sku required' });
  }

  if (!process.env.EBAY_APP_ID) {
    return res.status(503).json({ error: 'EBAY_APP_ID not configured', price: null });
  }

  const price = await searchEbayPrice(query, sku);
  res.json({ price, source: 'ebay' });
});

app.get('/health', (_req, res) => res.json({ ok: true, ebay: !!process.env.EBAY_APP_ID }));

app.listen(PORT, () => {
  const ebayStatus = process.env.EBAY_APP_ID ? '✓ eBay API configured' : '⚠ EBAY_APP_ID not set — price lookup disabled';
  console.log(`Scrape proxy running on http://localhost:${PORT}`);
  console.log(ebayStatus);
});
