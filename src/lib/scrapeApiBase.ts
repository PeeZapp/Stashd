/**
 * Scrape server (`server/proxy.js`) base URL for the browser.
 * - **Dev:** leave `VITE_SCRAPE_API_URL` unset — Vite proxies `/api` → `localhost:3001`.
 * - **Production:** set to your always-on API origin, e.g. `https://stashd-api.railway.app` (no trailing slash).
 */
export function scrapeApiUrl(pathAndQuery: string): string {
  const raw = import.meta.env.VITE_SCRAPE_API_URL as string | undefined;
  const base = raw?.trim().replace(/\/$/, '');
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  if (!base) return path;
  return `${base}${path}`;
}
