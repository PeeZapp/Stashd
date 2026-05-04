import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;
const PROXY_KEY = process.env.PROXY_KEY;

if (!PROXY_KEY) {
  console.error('[pi-proxy] PROXY_KEY environment variable is required');
  process.exit(1);
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
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

/** Strip stray trailing ":" from target URL (bad client/query encoding). Never strips ":" from "https://". */
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

/** Match server/proxy.js — first segment `en-au` → regional Accept-Language for LEGO / Akamai. */
function inferAcceptLanguageFromUrl(urlStr) {
  try {
    const first = new URL(urlStr).pathname.split('/').filter(Boolean)[0] || '';
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

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.slice(7);
  if (token !== PROXY_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/fetch', authMiddleware, async (req, res) => {
  const raw = req.query.url;
  if (raw == null || typeof raw !== 'string' || !String(raw).trim()) {
    return res.status(400).json({ error: 'url query param required' });
  }
  const url = normalizeScrapeUrl(raw);
  if (!url) {
    return res.status(400).json({ error: 'url query param required' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        ...BROWSER_HEADERS,
        'Accept-Language': inferAcceptLanguageFromUrl(url),
        Referer: parsedUrl.origin + '/',
        Host: parsedUrl.host,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });

    const html = await response.text();
    res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(html);
  } catch (err) {
    console.error(`[pi-proxy] Fetch failed for ${url}: ${err.message}`);
    res.status(502).json({ error: `Fetch failed: ${err.message}` });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[pi-proxy] Residential proxy server running on port ${PORT}`);
});
