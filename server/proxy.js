import express from 'express';

const app = express();
const PORT = 3001;

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

function storeFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const name = host.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
}

// ── eBay Finding API ───────────────────────────────────────

async function searchEbayPrice(query, sku) {
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
    const prices = items
      .map((item) => {
        const raw = item?.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'];
        return raw ? parseFloat(raw) : null;
      })
      .filter((p) => p !== null && p > 0);

    if (!prices.length) return null;
    return Math.round(Math.min(...prices) * 100) / 100;
  } catch {
    return null;
  }
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
    _debug: { htmlLength: html.length, hasJsonLd: ld !== null },
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
