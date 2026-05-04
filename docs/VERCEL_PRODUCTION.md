# Stashd production: Render (free API) + Vercel (frontend)

This guide assumes **Firebase, Firestore rules/indexes, the Pi proxy (if you use it), and local `.env` already work**. It focuses on deploying the **scrape API** on **Render’s free Web Service** and the **Vite/PWA app** on **Vercel**.

For Pi tunnel setup from scratch, see [`pi-proxy/PI_SETUP.md`](../pi-proxy/PI_SETUP.md).

---

## What runs where

| Piece | Role | Host |
|--------|------|------|
| **React app + PWA** | Browser UI | **Vercel** |
| **Scrape API** | `server/proxy.js` — `/api/scrape`, Playwright, OpenAI, optional Pi env vars | **Render Web Service** (or any always-on Node host) |
| **Firebase** | Auth + Firestore | Firebase (you already configured this) |
| **Pi** (optional) | Residential fallback | Your Pi + tunnel URL in **Render** env vars |

Vercel is a poor fit for long Playwright jobs; keep the API on Render (or similar) and point the app at it with **`VITE_SCRAPE_API_URL`**.

---

## Step A — Render: free Web Service for the API

### A.1 Create the service

1. Sign in at [render.com](https://render.com/) and connect **GitHub** (same repo as Stashd).
2. **New +** → **Web Service**.
3. Select your **Stashd** repository and the branch you deploy from (usually `main`).
4. **Name:** e.g. `stashd-api` (this becomes part of the hostname).
5. **Region:** pick one close to you (and to your Pi tunnel if latency matters).
6. **Instance type:** **Free** (see **A.5** for spin-down behavior).

### A.2 Docker (recommended): Playwright + Chromium on Render

Render’s **native Node** build environment is **read-only for `apt-get`**, so a **Build command** that runs `apt-get install chromium` **fails**. Use **Docker** instead; this repo includes a **`Dockerfile`** based on [`mcr.microsoft.com/playwright`](https://playwright.dev/docs/docker) (browsers and OS libraries already present).

#### There is no “switch to Docker” toggle on an existing Node service

Render chooses **Node vs Docker when the Web Service is first created** (the wizard step where you pick **Language** — set it to **Docker** per [Render’s Docker doc](https://docs.render.com/docs/docker)). For an existing Node service, the dashboard **does not** offer a simple runtime switch.

**Practical approach (recommended):** create a **new** Web Service from the same GitHub repo:

1. [Dashboard](https://dashboard.render.com/) → **New +** → **Web Service**.
2. Connect **Stashd**, branch **`main`**.
3. In the creation wizard, open the **Language** (or **Environment**) dropdown and select **Docker** — *not* Node.
4. **Dockerfile path:** `Dockerfile` (leave blank only if the file is at the repo root with that exact name).
5. **Docker build context:** `.` (default).
6. **Root Directory:** leave empty unless your app lives in a subfolder.
7. Copy **Environment** variables from your old service (same keys/values).
8. **Instance type:** Free (if you use it).
9. Create the service and wait for the first deploy.
10. Update **`VITE_SCRAPE_API_URL`** on Vercel to the **new** `https://….onrender.com` URL if the hostname changed, then delete or suspend the old Node service when you are done.

**Other ways to change runtime** (advanced): [Render Blueprint](https://docs.render.com/docs/infrastructure-as-code) (`render.yaml` with `runtime: docker`) or the [Update service API](https://api-docs.render.com/reference/update-service). Most people use a **new Web Service** instead.

#### After you have a Docker-based service

Render still splits **Settings** into **Build** and **Deploy**:

**Settings → Build**

| Field | What to set |
|--------|----------------|
| **Dockerfile path** | `Dockerfile` |
| **Docker build context directory** | `.` (default) |
| **Build command** | Leave **empty** for Docker — the Dockerfile runs `npm ci` and `npm run build`. Do **not** leave an old `apt-get …` line here. |

**Settings → Deploy**

| Field | What to set |
|--------|----------------|
| **Start command** | Leave **empty** — the image **`CMD`** is already `npm start`. |
| **Pre-deploy command** | Leave empty unless you add migrations later. |

Use **Manual Deploy → Clear build cache & deploy** after changing Docker-related settings.

### A.2b If you stay on native Node (not recommended here)

Use **Build** and **Deploy** separately — never put **`npm start`** in the **Build command**, and never use `; npm start` (that runs start even when `apt-get` / `npm install` fails → “Cannot find package `express`”).

**Settings → Build**

| Field | Value |
|--------|--------|
| **Environment** | Node |
| **Build command** | `npm install && npm run build` |

**Settings → Deploy**

| Field | Value |
|--------|--------|
| **Start command** | `npm start` |

Without Docker or a system Chromium, Playwright may still fail at runtime; prefer **Docker** above.

### A.3 Health check (optional but useful)

In the service **Settings**, set **Health Check Path** to:

`/health`

Render will probe this when the instance is up. It does **not** stop free-tier spin-down; it only helps detect bad deploys.

### A.4 Environment variables (Render → **Environment**)

Set these in the dashboard (never commit secrets to git):

| Variable | Notes |
|----------|--------|
| `OPENAI_API_KEY` | If you use OpenAI for hard pages |
| `OPENAI_BASE_URL` | Only if you use a non-default OpenAI-compatible endpoint |
| `RESIDENTIAL_PROXY_URL` | Your Pi tunnel base URL (optional) |
| `RESIDENTIAL_PROXY_KEY` | Same secret as on the Pi (optional) |
| `PLAYWRIGHT_CHROMIUM_PATH` or `CHROMIUM_PATH` | Only if you use **native Node** and Chromium is non-standard; **Docker** image usually needs neither |

**Do not set** `PORT` manually unless Render asks you to; Render injects `PORT`. `npm start` already sets `NODE_ENV=production` on Linux.

After the first successful deploy, copy the service URL, for example:

`https://stashd-api.onrender.com`

**No trailing slash** when you paste it into Vercel.

### A.5 Free tier: cold starts and limits

- **Spin-down:** After ~15 minutes of no traffic, the free Web Service **sleeps**. The next request can take **30–60+ seconds** while the instance wakes and runs the build output + Chromium path again.
- **Hours:** Free instances have a monthly cap (check Render’s pricing page); one always-on service is usually within the free allowance if it spins down when idle.
- **Keep-warm:** External cron hitting `/health` every 10 minutes is fragile against ToS and still not guaranteed to keep the instance hot; treat cold starts as normal for free tier.

---

## Step B — Vercel: frontend

### B.1 Import the project

1. [vercel.com](https://vercel.com/) → **Add New…** → **Project** → **Import** the same Stashd repo.
2. Framework: **Vite** (auto-detected is fine).

### B.2 Build settings

| Setting | Value |
|---------|--------|
| **Build command** | `npm run build` |
| **Output directory** | `dist` |
| **Install command** | `npm install` (default) |

### B.3 Environment variables (Vercel → **Settings** → **Environment Variables**, Production)

**Firebase (same values as local, all `VITE_` prefixed):**

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

**Scrape API (required for production scraping from the deployed site):**

| Name | Example |
|------|--------|
| `VITE_SCRAPE_API_URL` | `https://stashd-api.onrender.com` — **no** trailing slash |

Leave `VITE_SCRAPE_API_URL` **unset** locally so Vite’s dev proxy can keep sending `/api` to `localhost:3001` (see `vite.config.ts`).

### B.4 Deploy and Firebase domain

1. Click **Deploy**, then open the `*.vercel.app` URL.
2. Firebase → **Authentication** → **Settings** → **Authorized domains** → add your **`your-project.vercel.app`** hostname (and any custom domain later).

### B.5 Smoke test

Sign in → **Add product** with a URL → confirm scrape works (first hit after idle may be slow if Render was asleep).

---

## CORS

`server/proxy.js` already sends permissive CORS headers so the browser on Vercel can call your Render origin when `VITE_SCRAPE_API_URL` is set.

---

## Custom domain (optional)

1. Registrar or DNS → records Vercel shows for your hostname.
2. Vercel → **Project** → **Settings** → **Domains** → add the hostname.
3. Firebase **Authorized domains** → add the same hostname.
4. If the scrape API moves to a custom host, update **`VITE_SCRAPE_API_URL`** on Vercel and redeploy.

---

## PWA

The app uses **`vite-plugin-pwa`**. HTTPS on Vercel is enough for install / service worker in supported browsers.

---

## Checklist

- [ ] Render Web Service: build + start, env vars, URL copied
- [ ] Vercel: `VITE_FIREBASE_*` + `VITE_SCRAPE_API_URL` (Render origin, no trailing slash)
- [ ] Firebase **authorized domains** include the Vercel hostname
- [ ] Production test: sign in → add product → refresh prices

---

## Appendix — Firebase / Firestore (if anything is still missing)

- **Rules:** Firebase → Firestore → **Rules** — publish contents of [`firestore.rules`](../firestore.rules).
- **Indexes:** deploy [`firestore.indexes.json`](../firestore.indexes.json) with `firebase deploy --only firestore:indexes`, or use the console links after the first failing query.
- **Web app config:** same keys as the `VITE_FIREBASE_*` table in [README.md](../README.md).

---

## Appendix — Other API hosts

The same `npm install && npm run build` + `npm start` pattern works on **Railway**, **Fly.io**, or a **VPS** with `systemd`; always set secrets in the host’s env UI, not in git.

---

## Related repo files

- [`firestore.rules`](../firestore.rules) — Firestore security rules  
- [`firestore.indexes.json`](../firestore.indexes.json) — composite indexes for `list_products`  
- [`README.md`](../README.md) — local dev, env overview  
- [`pi-proxy/PI_SETUP.md`](../pi-proxy/PI_SETUP.md) — Pi + tunnel for `RESIDENTIAL_PROXY_*`
