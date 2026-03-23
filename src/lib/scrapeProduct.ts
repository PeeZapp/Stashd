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
        else if (Array.isArray(img) && img.length > 0) {
          result.image = typeof img[0] === 'string' ? img[0] : (img[0] as Record<string, string>).url;
        } else if (img && typeof img === 'object') {
          result.image = (img as Record<string, string>).url;
        }

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
    } catch {
      // malformed JSON-LD — skip
    }
  }
  return null;
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

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchMicrolink(url: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(
      `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=false`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    );
    const json = await res.json();
    return json.status === 'success' ? (json.data ?? {}) : {};
  } catch {
    return {};
  }
}

export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  // Run HTML fetch and microlink lookup in parallel for speed
  const [html, ml] = await Promise.all([fetchHtml(url), fetchMicrolink(url)]);

  let title: string | null = null;
  let current_price: number | null = null;
  let original_price: number | null = null;
  let image_url: string | null = null;
  let store_name: string | null = null;
  let description: string | null = null;
  let availabilityHints = '';

  if (html) {
    // 1) JSON-LD structured data — highest fidelity
    const ld = parseJsonLd(html);
    if (ld) {
      if (ld.title) title = ld.title;
      if (ld.image) image_url = ld.image;
      if (ld.description) description = ld.description;
      if (ld.price !== undefined && ld.price > 0) current_price = ld.price;
      if (
        ld.highPrice !== undefined &&
        ld.highPrice > 0 &&
        ld.highPrice > (current_price ?? 0)
      ) {
        original_price = ld.highPrice;
      }
      // lowPrice means the price range starts at — treat current as lowPrice if we got both
      if (ld.lowPrice !== undefined && ld.price === undefined) current_price = ld.lowPrice;
      if (ld.availability) availabilityHints += ' ' + ld.availability;
    }

    // 2) Open Graph tags
    title = title ?? extractOgTag(html, 'title');
    image_url = image_url ?? extractOgTag(html, 'image') ?? extractOgTag(html, 'image:secure_url');
    description = description ?? extractOgTag(html, 'description');
    store_name = extractOgTag(html, 'site_name');

    if (!current_price) {
      // og:price:amount, product:price:amount, og:product:price:amount
      current_price =
        parsePrice(extractOgTag(html, 'price:amount')) ??
        parsePrice(extractMetaTag(html, 'product:price:amount')) ??
        parsePrice(extractMetaTag(html, 'price'));
    }

    // 3) Microdata itemprop
    if (!current_price) {
      current_price = parsePrice(extractItemprop(html, 'price'));
    }
    if (!image_url) {
      image_url = extractItemprop(html, 'image');
    }

    // 4) Availability signals
    const ogAvail = extractOgTag(html, 'availability') ?? extractMetaTag(html, 'availability');
    if (ogAvail) availabilityHints += ' ' + ogAvail;

    // 5) HTML title fallback
    if (!title) {
      const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (m) title = m[1].trim();
    }
  }

  // ── Microlink fallbacks ──
  title = title ?? (ml.title as string) ?? null;
  image_url = image_url ?? (ml.image as { url: string } | null)?.url ?? (ml.logo as { url: string } | null)?.url ?? null;
  description = description ?? (ml.description as string) ?? null;
  store_name = store_name ?? (ml.publisher as string) ?? storeFromUrl(url);

  if (!current_price && ml.price) {
    current_price = parsePrice(ml.price as string);
  }

  // ── Stock detection ──
  const combinedText = [title, description, availabilityHints].filter(Boolean).join(' ');
  const is_out_of_stock =
    detectOutOfStock(combinedText) ||
    /outofstock|out_of_stock|discontinued/i.test(availabilityHints);

  // ── Sale detection ──
  const is_on_sale =
    current_price !== null && original_price !== null && original_price > current_price;

  return {
    title,
    current_price,
    original_price,
    is_on_sale,
    is_out_of_stock,
    image_url,
    store_name,
    description,
  };
}
