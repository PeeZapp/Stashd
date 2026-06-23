/**
 * Scrape server (`server/proxy.js`) base URL for the browser.
 * - **Dev:** calls `http://localhost:3100` directly (CORS enabled on the proxy). Avoids Vite's
 *   `/api` proxy, which clashes with other local apps (Next.js, etc.) on ports 5000–5001.
 * - **Production:** set `VITE_SCRAPE_API_URL` to your always-on API origin (no trailing slash).
 */
export function scrapeApiUrl(pathAndQuery: string): string {
  const raw = import.meta.env.VITE_SCRAPE_API_URL as string | undefined;
  const base = raw?.trim().replace(/\/$/, '');
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  if (base) return `${base}${path}`;
  if (import.meta.env.DEV) {
    const port = import.meta.env.VITE_SCRAPE_PROXY_PORT || '3100';
    const apiPath = path.replace(/^\/api/, '');
    return `http://localhost:${port}${apiPath}`;
  }
  return path;
}
