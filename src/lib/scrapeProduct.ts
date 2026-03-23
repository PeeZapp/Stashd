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

export function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return isNaN(raw) || raw <= 0 ? null : raw;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

// ── Try the local server-side proxy first ──────────────────
// When running in Replit (dev), Vite proxies /api → localhost:3001.
// The proxy fetches product pages server-side with real browser headers,
// bypassing CORS restrictions and bot-detection that blocks browser requests.

async function fetchViaProxy(url: string): Promise<ScrapedProduct | null> {
  try {
    const res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(18000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return {
      title: data.title ?? null,
      current_price: data.current_price ?? null,
      original_price: data.original_price ?? null,
      is_on_sale: data.is_on_sale ?? false,
      is_out_of_stock: data.is_out_of_stock ?? false,
      image_url: data.image_url ?? null,
      store_name: data.store_name ?? null,
      description: data.description ?? null,
    };
  } catch {
    return null;
  }
}

// ── CORS-proxy fallback (used if local proxy is unavailable) ──

function parsePrice2(raw: string | number | null | undefined): number | null {
  return parsePrice(raw);
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
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return m[1].trim();
  }
  return null;
}

function parseJsonLdFromHtml(html: string): {
  title?: string; price?: number; highPrice?: number; image?: string; description?: string; availability?: string;
} | null {
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
        const typeStr = String(Array.isArray(obj['@type']) ? (obj['@type'] as string[]).join(' ') : (obj['@type'] ?? ''));
        if (!typeStr.toLowerCase().includes('product')) continue;
        const result: Record<string, unknown> = {};
        if (typeof obj.name === 'string') result.title = obj.name;
        if (typeof obj.description === 'string') result.description = obj.description;
        const img = obj.image;
        if (typeof img === 'string') result.image = img;
        else if (Array.isArray(img) && img.length > 0)
          result.image = typeof img[0] === 'string' ? img[0] : (img[0] as Record<string, string>).url;
        const offersRaw = obj.offers;
        const offers = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
        if (offers && typeof offers === 'object') {
          const o = offers as Record<string, unknown>;
          const p = parsePrice2(o.price as string);
          if (p !== null) result.price = p;
          const hp = parsePrice2(o.highPrice as string);
          if (hp !== null) result.highPrice = hp;
          if (typeof o.availability === 'string') result.availability = o.availability;
        }
        if (result.title || result.price !== undefined) return result as never;
      }
    } catch { /* skip */ }
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

async function fetchViaCorsProxy(url: string): Promise<ScrapedProduct | null> {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  let html: string | null = null;
  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 500) { html = text; break; }
    } catch { /* try next */ }
  }

  const [ml] = await Promise.all([fetchMicrolink(url)]);

  let title: string | null = null;
  let current_price: number | null = null;
  let original_price: number | null = null;
  let image_url: string | null = null;
  let store_name: string | null = null;
  let description: string | null = null;

  if (html) {
    const ld = parseJsonLdFromHtml(html);
    if (ld) {
      if (ld.title) title = ld.title;
      if (ld.image) image_url = ld.image;
      if (ld.description) description = ld.description;
      if (ld.price !== undefined && ld.price > 0) current_price = ld.price;
      if (ld.highPrice !== undefined && ld.highPrice > (current_price ?? 0)) original_price = ld.highPrice;
    }
    title = title ?? extractOgTag(html, 'title');
    image_url = image_url ?? extractOgTag(html, 'image');
    description = description ?? extractOgTag(html, 'description') ?? extractMetaTag(html, 'description');
    if (!current_price) {
      current_price =
        parsePrice(extractOgTag(html, 'price:amount')) ??
        parsePrice(extractMetaTag(html, 'product:price:amount'));
    }
  }

  title = title ?? (ml.title as string) ?? null;
  image_url = image_url ?? (ml.image as { url: string } | null)?.url ?? null;
  description = description ?? (ml.description as string) ?? null;
  store_name = (ml.publisher as string) ?? null;
  if (!current_price && ml.price) current_price = parsePrice(ml.price as string);

  if (!title && !image_url) return null;

  return {
    title,
    current_price,
    original_price,
    is_on_sale: current_price !== null && original_price !== null && original_price > current_price,
    is_out_of_stock: false,
    image_url,
    store_name,
    description,
  };
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
  // Try the server-side proxy first (works with proper browser headers, no CORS)
  const proxyResult = await fetchViaProxy(url);
  if (proxyResult && (proxyResult.title || proxyResult.image_url)) {
    if (!proxyResult.store_name) proxyResult.store_name = storeFromUrl(url);
    return proxyResult;
  }

  // Fall back to CORS proxies + microlink (degrades gracefully without the proxy server)
  const corsResult = await fetchViaCorsProxy(url);
  if (corsResult) {
    if (!corsResult.store_name) corsResult.store_name = storeFromUrl(url);
    return corsResult;
  }

  // Last resort: return empty product with just the store name
  return {
    title: null,
    current_price: null,
    original_price: null,
    is_on_sale: false,
    is_out_of_stock: false,
    image_url: null,
    store_name: storeFromUrl(url),
    description: null,
  };
}
