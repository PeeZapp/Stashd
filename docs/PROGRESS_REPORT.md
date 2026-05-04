# Stashd — progress report

**Last updated:** 2026-05-04 (AU)

---

## Session summary (today)

We focused on **production deployment**, **scrape reliability**, and **operator UX**, then layered in **cheap anti-bot improvements** before documenting paid and official-data options.

### Shipped or locked in

- **Render (Docker)** — Playwright base image, `node` as PID 1 (cleaner deploy logs than `npm start` + SIGTERM noise).
- **Vercel** — Frontend + `VITE_SCRAPE_API_URL` + Firebase env; Pi + Cloudflare tunnel unchanged for typical setups (see `docs/VERCEL_PRODUCTION.md`).
- **Firestore** — Rules, composite indexes, client queries using `user_id` where required by rules.
- **Pi proxy** — URL normalization (trailing `:`), regional `Accept-Language` (path `en-au` and `*.com.au`), early-fetch path on Render for HTTP 401/403 before Playwright, `hasLikelyProductPageHtml` so good HTML is not discarded on strict “blocked” heuristics.
- **Dashboard** — Single **App ready** pill (green / yellow / red); **Check prices** + clearer copy; deploy doc updates (Build vs Deploy, no Node→Docker toggle on existing service).
- **Scraping (this session, commit `13f1a47` and related)** — `got-scraping` on fast fetch (Render + Pi), Playwright **origin warm-up**, light **mouse/scroll**, **mobile Safari retry** when desktop render still looks blocked; LEGO AU path verified working end-to-end after Pi + locale fixes.

---

## Scraping — current architecture

| Stage | Role |
|--------|------|
| **1. Fast HTTP** | `got-scraping` (Chrome-like header / HTTP2 ordering; falls back to Node `fetch`) + `Accept-Language` from URL / `*.com.au`. |
| **2. Early Pi** | On **401/403** with Pi configured, residential fetch **before** Playwright. |
| **3. Playwright** | Stealth Chromium; warm **origin/** then PDP; mouse + small scroll; **mobile profile** retry if desktop still looks blocked. |
| **4. Pi fallback** | After Playwright failure; same `got-scraping` on Pi for TLS vs raw `fetch`. |
| **5. Extraction** | JSON-LD, OG, scripts, LLM fallback when title/price still missing. |
| **6. Manual** | User entry when all automated paths fail or return no trustworthy product data. |

### What still fails (and why)

- **Cloudflare managed challenge** (e.g. some **EB Games** pages): response is challenge HTML, not a PDP. **Residential IP alone does not fix** TLS + headless detection; consumer “Claude opened the link” uses **different** infra than the **Messages API** unless you add **paid unlockers** or **API web-fetch tools** with their own limits and billing.
- **Headers vs fingerprint:** Header sets are reasonable; **Node TLS** still differs from real Chrome until `got-scraping` / Playwright. Strong CDNs score **both**.

### Cheap wins now in repo (item “1” from prior plan)

- **`got-scraping`** on first hop and on Pi (`server/proxy.js`, `pi-proxy/server.js`).
- **Origin cookie warm-up** + **human-ish micro-interaction** in Playwright.
- **Mobile UA retry** after a bad desktop render.

### Paid fallback (item “2”) — best value for rare hard pages

| Provider | Notes |
|----------|--------|
| **Bright Data Web Unlocker** | **Pay-per-use**, strong on hard CF; good when only a **small fraction** of URLs need unlock. |
| **Scrapfly** | Predictable monthly-ish plans, good DX. |
| **ScrapingBee / ZenRows / ScraperAPI** | Easier onboarding; premium tiers for hardest sites. |

**Suggested integration pattern:** env-gated **Step 2c** — only call unlocker after Playwright + Pi fail; cap daily calls (`UNLOCKER_MAX_*`) so cost stays bounded.

### Official / affiliate APIs (expectations)

| Source | Reality |
|--------|---------|
| **eBay Browse API** | Easy developer keys; eBay-only. |
| **Amazon PA-API** | Needs **Associates** + **qualifying sales** before full access. |
| **Shopify `…/products/<handle>.json`** | Often **public**; no affiliate needed — high ROI to detect and use. |
| **LEGO, JB, EB, Target AU, etc.** | Affiliate networks exist for **links/commission**; they **do not** replace product APIs for scraping. |

---

## Where we are now

- **Production path:** Vercel (app) + Render Docker (scrape API) + Firebase + optional Pi tunnel — **working**; LEGO AU scrape **confirmed** after Pi update and locale logic.
- **Operator friction:** Render “SIGTERM / npm error” noise reduced by running **`node server/proxy.js`** directly in Docker; Pi restart steps documented in `VERCEL_PRODUCTION.md` / `PI_SETUP.md`.
- **Scraping:** Stack is stronger on **fingerprint + warm-up + mobile retry**; hardest retailers remain **unlocker or manual**.

---

## Next steps (recommended order)

1. **Deploy verification** — Confirm Render latest + Pi `git pull` + `npm install` in `pi-proxy` + `systemctl restart` after each scrape-related release.
2. **Optional: Shopify JSON fast path** — If host is Shopify, try `/products/<handle>.json` before heavy scrape (small code change, big win for indie stores).
3. **Optional: paid unlocker** — Add Bright Data (or Scrapfly) behind env flags + per-day cap for EB-class sites only.
4. **Optional: eBay / Amazon** — Product-detail flows using official APIs where the URL is clearly those merchants (separate feature design).
5. **Monitoring** — Log scrape outcome buckets (`fast_ok`, `playwright_ok`, `pi_ok`, `manual`) to a simple counter or external log for tuning spend on unlockers.

---

## Related docs

- [`VERCEL_PRODUCTION.md`](./VERCEL_PRODUCTION.md) — Render + Vercel + Pi notes  
- [`pi-proxy/PI_SETUP.md`](../pi-proxy/PI_SETUP.md) — Pi + Cloudflare tunnel  
- [`README.md`](../README.md) — Local env, Firebase table  
