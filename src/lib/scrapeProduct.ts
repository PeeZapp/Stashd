import { normalizeProtocolRelativeUrl } from './normalizeMediaUrl';
import { scrapeApiUrl } from './scrapeApiBase';

export interface ScrapedProduct {
  title: string | null;
  current_price: number | null;
  original_price: number | null;
  is_on_sale: boolean;
  image_url: string | null;
  store_name: string | null;
  description: string | null;
  sku: string | null;
  price_source: 'manual' | 'ebay' | 'scraped' | null;
  botProtected?: boolean;
}

export function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return isNaN(raw) || raw <= 0 ? null : raw;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

// ── Local server-side proxy ────────────────────────────────

async function fetchViaProxy(url: string): Promise<ScrapedProduct | null> {
  try {
    const res = await fetch(scrapeApiUrl(`/api/scrape?url=${encodeURIComponent(url)}`), {
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json();
    if (data.error === 'bot_protection') {
      return {
        title: null,
        current_price: null,
        original_price: null,
        is_on_sale: false,
        image_url: null,
        store_name: data.store_name ?? storeFromUrl(url),
        description: null,
        sku: null,
        price_source: null,
        botProtected: true,
      };
    }
    if (!res.ok || data.error) return null;
    return {
      title: data.title ?? null,
      current_price: data.current_price ?? null,
      original_price: data.original_price ?? null,
      is_on_sale: data.is_on_sale ?? false,
      image_url: normalizeProtocolRelativeUrl(data.image_url ?? null) || null,
      store_name: data.store_name ?? null,
      description: data.description ?? null,
      sku: data.sku ?? null,
      price_source: data.price_source ?? null,
    };
  } catch {
    return null;
  }
}

// ── CORS-proxy fallback ────────────────────────────────────

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

  const ml = await fetchMicrolink(url);

  let title: string | null = null;
  let current_price: number | null = null;
  let original_price: number | null = null;
  let image_url: string | null = null;
  let store_name: string | null = null;
  let description: string | null = null;

  if (html) {
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
    image_url: normalizeProtocolRelativeUrl(image_url) || null,
    store_name,
    description,
    sku: null,
    price_source: current_price !== null ? 'scraped' : null,
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
  // 1. Try server-side proxy
  const proxyResult = await fetchViaProxy(url);
  if (proxyResult?.botProtected) {
    return proxyResult;
  }
  if (proxyResult && (proxyResult.title || proxyResult.image_url)) {
    if (!proxyResult.store_name) proxyResult.store_name = storeFromUrl(url);
    return proxyResult;
  }

  // 2. CORS proxy fallback
  const corsResult = await fetchViaCorsProxy(url);
  if (corsResult) {
    if (!corsResult.store_name) corsResult.store_name = storeFromUrl(url);
    return corsResult;
  }

  // 3. Last resort — just store what we know
  return {
    title: null,
    current_price: null,
    original_price: null,
    is_on_sale: false,
    image_url: null,
    store_name: storeFromUrl(url),
    description: null,
    sku: null,
    price_source: null,
  };
}
