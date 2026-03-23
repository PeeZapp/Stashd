export interface ScrapedProduct {
  title: string | null;
  current_price: number | null;
  original_price: number | null;
  is_on_sale: boolean;
  is_out_of_stock: boolean;
  image_url: string | null;
  store_name: string | null;
  description: string | null;
}

const OUT_OF_STOCK_KEYWORDS = [
  'out of stock', 'out-of-stock', 'sold out', 'sold-out',
  'unavailable', 'not available', 'currently unavailable',
  'temporarily unavailable', 'no longer available',
];

function detectOutOfStock(text: string): boolean {
  const lower = text.toLowerCase();
  return OUT_OF_STOCK_KEYWORDS.some((kw) => lower.includes(kw));
}

export function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return isNaN(raw) || raw <= 0 ? null : raw;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

// ── HTML tag extraction helpers ─────────────────────────────

function extractOgTag(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["'][^"']*og:${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["'][^"']*og:${property}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return m[1].trim();
  }
  return null;
}

function extractMetaTag(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'),
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return m[1].trim();
  }
  return null;
}

function extractItemprop(html: string, prop: string): string | null {
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

// ── JSON-LD structured data ────────────────────────────────

interface LdResult {
  title?: string;
  price?: number;
  highPrice?: number;
  lowPrice?: number;
  image?: string;
  description?: string;
  availability?: string;
}

function parseJsonLd(html: string): LdResult | null {
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const items: unknown[] = Array.isArray(data)
        ? data
        : data['@graph']
        ? data['@graph']
        : [data];

      for (const item of items) {
        if (typeof item !== 'object' || item === null) continue;
        const obj = item as Record<string, unknown>;
        const type = obj['@type'];
        const typeStr = Array.isArray(type) ? type.join(' ') : String(type ?? '');
        if (!typeStr.toLowerCase().includes('product')) continue;

        const result: LdResult = {};
        if (typeof obj.name === 'string') result.title = obj.name;
        if (typeof obj.description === 'string') result.description = obj.description;

        // Image
        const img = obj.image;
        if (typeof img === 'string') result.image = img;
        else if (Array.isArray(img) && img.length > 0)
          result.image = typeof img[0] === 'string' ? img[0] : (img[0] as Record<string, string>).url;
        else if (img && typeof img === 'object')
          result.image = (img as Record<string, string>).url;

        // Offers
        const offersRaw = obj.offers;
        const offers = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
        if (offers && typeof offers === 'object') {
          const o = offers as Record<string, unknown>;
          const p = parsePrice(o.price as string);
          if (p !== null) result.price = p;
          const hp = parsePrice(o.highPrice as string);
          if (hp !== null) result.highPrice = hp;
          const lp = parsePrice(o.lowPrice as string);
          if (lp !== null) result.lowPrice = lp;
          if (typeof o.availability === 'string') result.availability = o.availability;
        }

        if (result.title || result.price !== undefined) return result;
      }
    } catch { /* malformed JSON-LD */ }
  }
  return null;
}

// ── Embedded JS price extraction ────────────────────────────
// Many ecommerce sites bake product data into window variables or inline JSON
// even when they later render prices via JavaScript.

function extractPriceFromScripts(html: string): { price: number | null; originalPrice: number | null } {
  // Pull all <script> content (excluding JSON-LD which we handle separately)
  const scriptBlocks: string[] = [];
  const scriptPattern = /<script(?!\s[^>]*type=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptPattern.exec(html)) !== null) {
    if (m[1] && m[1].trim().length > 10) scriptBlocks.push(m[1]);
  }
  const scriptContent = scriptBlocks.join('\n');

  // Patterns to try, in priority order.
  // Each pattern returns a price in dollars (some stores use cents, handled below).
  const DOLLAR_PATTERNS: RegExp[] = [
    // JSON-like: "price": 49.99  /  "price":"49.99"  /  "price": "49.99"
    /"(?:current_price|salePrice|finalPrice|discountedPrice|price_numeric|priceValue|sellingPrice|selling_price)"\s*:\s*"?\$?(\d{1,4}(?:\.\d{1,2})?)"?/i,
    // Standard price key — avoid matching version strings (price > 0.99)
    /"price"\s*:\s*"?\$?(\d{1,4}\.\d{2})"?/,
    // price_amount / amount / displayPrice
    /"(?:price_amount|amount|displayPrice|formatted_price|priceFormatted)"\s*:\s*"?\$?(\d{1,4}(?:\.\d{1,2})?)"?/i,
    // JavaScript assignment: price = 49.99; / var price = 49.99
    /(?:var|let|const)\s+price\s*=\s*(\d{1,4}\.\d{2})/,
    // Shopify: "price":4999 (cents) — we detect if > 99 and integer, divide by 100
    /"price"\s*:\s*(\d{3,6})(?!\.\d)/,
  ];

  const ORIGINAL_PRICE_PATTERNS: RegExp[] = [
    /"(?:compareAtPrice|compare_at_price|originalPrice|original_price|regularPrice|regular_price|wasPrice|was_price|listPrice|list_price|rrp|retailPrice|retail_price)"\s*:\s*"?\$?(\d{1,4}(?:\.\d{1,2})?)"?/i,
    /"compareAtPrice"\s*:\s*(\d{3,6})(?!\.\d)/,
  ];

  let price: number | null = null;
  let originalPrice: number | null = null;

  for (const pattern of DOLLAR_PATTERNS) {
    const match = pattern.exec(scriptContent);
    if (match) {
      let val = parseFloat(match[1]);
      if (!isNaN(val) && val > 0) {
        // Shopify-style cents: integer > 99, assume cents
        if (Number.isInteger(val) && val > 99 && !match[0].includes('.')) {
          val = val / 100;
        }
        if (val > 0 && val < 100000) {
          price = val;
          break;
        }
      }
    }
  }

  for (const pattern of ORIGINAL_PRICE_PATTERNS) {
    const match = pattern.exec(scriptContent);
    if (match) {
      let val = parseFloat(match[1]);
      if (!isNaN(val) && val > 0) {
        if (Number.isInteger(val) && val > 99 && !match[0].includes('.')) {
          val = val / 100;
        }
        if (val > 0 && val < 100000) {
          originalPrice = val;
          break;
        }
      }
    }
  }

  return { price, originalPrice };
}

// ── Network helpers ─────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 500) return text;
    } catch {
      // try next proxy
    }
  }
  return null;
}

async function fetchMicrolink(url: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(
      `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=false`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
    );
    const json = await res.json();
    return json.status === 'success' ? (json.data ?? {}) : {};
  } catch {
    return {};
  }
}

function storeFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const name = host.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
}

// ── Main export ─────────────────────────────────────────────

export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  // Fetch HTML and microlink data in parallel
  const [html, ml] = await Promise.all([fetchHtml(url), fetchMicrolink(url)]);

  let title: string | null = null;
  let current_price: number | null = null;
  let original_price: number | null = null;
  let image_url: string | null = null;
  let store_name: string | null = null;
  let description: string | null = null;
  let availabilityHints = '';

  if (html) {
    // 1) JSON-LD — highest fidelity when available
    const ld = parseJsonLd(html);
    if (ld) {
      if (ld.title) title = ld.title;
      if (ld.image) image_url = ld.image;
      if (ld.description) description = ld.description;
      if (ld.price !== undefined && ld.price > 0) current_price = ld.price;
      if (ld.highPrice !== undefined && ld.highPrice > 0 && ld.highPrice > (current_price ?? 0))
        original_price = ld.highPrice;
      if (ld.lowPrice !== undefined && ld.price === undefined) current_price = ld.lowPrice;
      if (ld.availability) availabilityHints += ' ' + ld.availability;
    }

    // 2) Open Graph
    title = title ?? extractOgTag(html, 'title');
    image_url = image_url ?? extractOgTag(html, 'image') ?? extractOgTag(html, 'image:secure_url');
    description = description ?? extractOgTag(html, 'description') ?? extractMetaTag(html, 'description');
    store_name = extractOgTag(html, 'site_name');

    if (!current_price) {
      current_price =
        parsePrice(extractOgTag(html, 'price:amount')) ??
        parsePrice(extractMetaTag(html, 'product:price:amount')) ??
        parsePrice(extractMetaTag(html, 'price'));
    }

    // 3) Microdata itemprop
    if (!current_price) current_price = parsePrice(extractItemprop(html, 'price'));
    if (!image_url) image_url = extractItemprop(html, 'image');

    // 4) Embedded JavaScript data (Shopify, custom stores, etc.)
    if (!current_price) {
      const jsResult = extractPriceFromScripts(html);
      if (jsResult.price !== null) current_price = jsResult.price;
      if (jsResult.originalPrice !== null && original_price === null) original_price = jsResult.originalPrice;
    }

    // 5) Availability hints
    const ogAvail = extractOgTag(html, 'availability') ?? extractMetaTag(html, 'availability');
    if (ogAvail) availabilityHints += ' ' + ogAvail;

    // 6) HTML <title> fallback
    if (!title) {
      const tm = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (tm) title = tm[1].trim();
    }
  }

  // ── Microlink fallbacks ──
  title = title ?? (ml.title as string) ?? null;
  image_url = image_url ?? (ml.image as { url: string } | null)?.url ?? (ml.logo as { url: string } | null)?.url ?? null;
  description = description ?? (ml.description as string) ?? null;
  store_name = store_name ?? (ml.publisher as string) ?? storeFromUrl(url);
  if (!current_price && ml.price) current_price = parsePrice(ml.price as string);

  // ── Stock detection ──
  const combinedText = [title, description, availabilityHints].filter(Boolean).join(' ');
  const is_out_of_stock =
    detectOutOfStock(combinedText) ||
    /outofstock|out_of_stock|discontinued/i.test(availabilityHints);

  // ── Sale detection ──
  const is_on_sale =
    current_price !== null && original_price !== null && original_price > current_price;

  // Round prices to 2dp
  if (current_price !== null) current_price = Math.round(current_price * 100) / 100;
  if (original_price !== null) original_price = Math.round(original_price * 100) / 100;

  return { title, current_price, original_price, is_on_sale, is_out_of_stock, image_url, store_name, description };
}
