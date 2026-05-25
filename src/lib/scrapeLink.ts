import { normalizeProtocolRelativeUrl } from './normalizeMediaUrl';
import { scrapeApiUrl } from './scrapeApiBase';
import type { SavedLinkMetadata, SavedLinkType, ScrapedLink } from './types';

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

function storeFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const name = host.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
}

function detectPlatform(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('pinterest.')) return 'Pinterest';
    return null;
  } catch {
    return null;
  }
}

function getYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) return u.pathname.split('/').filter(Boolean)[0] ?? null;
    if (host.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/').filter(Boolean)[1] ?? null;
      return u.searchParams.get('v');
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchYouTubeOembed(url: string): Promise<ScrapedLink | null> {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
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
          ? normalizeProtocolRelativeUrl(data.thumbnail_url) || null
          : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      site_name: 'YouTube',
      favicon_url: 'https://www.youtube.com/s/desktop/favicon.ico',
      link_type: 'video',
      metadata: {
        platform: 'YouTube',
        creator: typeof data.author_name === 'string' ? data.author_name : null,
        embed_url: `https://www.youtube.com/embed/${videoId}`,
      },
    };
  } catch {
    return null;
  }
}

function inferLinkType(url: string, serverType?: string): SavedLinkType {
  if (serverType && serverType !== 'other') return serverType as SavedLinkType;
  if (detectPlatform(url)) return 'video';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/recipe|allrecipes|foodnetwork|bonappetit|seriouseats|tasty|delish/.test(host))
      return 'recipe';
  } catch {
    /* ignore */
  }
  return 'other';
}

async function fetchViaProxy(url: string): Promise<ScrapedLink | null> {
  try {
    const res = await fetch(scrapeApiUrl(`/api/scrape-link?url=${encodeURIComponent(url)}`), {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    const metadata = (data.metadata ?? {}) as SavedLinkMetadata;
    return {
      url: data.url ?? url,
      canonical_url: data.canonical_url ?? url,
      title: data.title ?? null,
      description: data.description ?? null,
      image_url: normalizeProtocolRelativeUrl(data.image_url ?? '') || null,
      site_name: data.site_name ?? null,
      favicon_url: normalizeProtocolRelativeUrl(data.favicon_url ?? '') || null,
      link_type: inferLinkType(url, data.link_type),
      metadata,
    };
  } catch {
    return null;
  }
}

async function fetchViaCorsProxy(url: string): Promise<ScrapedLink | null> {
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
      if (text && text.length > 500) {
        html = text;
        break;
      }
    } catch {
      /* try next */
    }
  }

  const ml = await fetchMicrolink(url);

  let title: string | null = null;
  let description: string | null = null;
  let image_url: string | null = null;
  let site_name: string | null = null;

  if (html) {
    title = extractOgTag(html, 'title') ?? extractMetaTag(html, 'twitter:title');
    image_url = extractOgTag(html, 'image') ?? extractMetaTag(html, 'twitter:image');
    description =
      extractOgTag(html, 'description') ??
      extractMetaTag(html, 'description') ??
      extractMetaTag(html, 'twitter:description');
    if (!title) {
      const tm = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
      if (tm) title = tm[1].trim();
    }
  }

  title = title ?? (ml.title as string) ?? null;
  image_url = image_url ?? (ml.image as { url: string } | null)?.url ?? null;
  description = description ?? (ml.description as string) ?? null;
  site_name = (ml.publisher as string) ?? storeFromUrl(url);

  if (!title && !image_url) return null;

  const platform = detectPlatform(url);
  return {
    url,
    canonical_url: url,
    title,
    description,
    image_url: normalizeProtocolRelativeUrl(image_url) || null,
    site_name,
    favicon_url: null,
    link_type: inferLinkType(url),
    metadata: platform ? { platform } : {},
  };
}

export async function scrapeLink(url: string): Promise<ScrapedLink> {
  const youtubeResult = await fetchYouTubeOembed(url);
  if (youtubeResult?.title || youtubeResult?.image_url) return youtubeResult;

  const proxyResult = await fetchViaProxy(url);
  if (proxyResult && (proxyResult.title || proxyResult.image_url)) {
    if (!proxyResult.site_name) proxyResult.site_name = storeFromUrl(url);
    return proxyResult;
  }

  const corsResult = await fetchViaCorsProxy(url);
  if (corsResult) {
    if (!corsResult.site_name) corsResult.site_name = storeFromUrl(url);
    return corsResult;
  }

  return {
    url,
    canonical_url: url,
    title: storeFromUrl(url) || url,
    description: null,
    image_url: null,
    site_name: storeFromUrl(url),
    favicon_url: null,
    link_type: inferLinkType(url),
    metadata: detectPlatform(url) ? { platform: detectPlatform(url)! } : {},
  };
}
