# Stashd

A universal product wishlist app — save items from any store, track prices and sales, organize into lists, and share with friends.

## Tech stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + CSS custom properties for theming
- **Backend / auth / DB**: Firebase Auth + Firestore
- **Icons**: Lucide React
- **Scraping**: Node.js proxy (`server/proxy.js`) with Playwright/Chromium for bot-protected sites, plus OpenAI as a fallback for hard-to-parse pages

## Project structure

```
src/
  App.tsx               - Root component with client-side routing (dashboard, profile, shared)
  main.tsx              - Entry point; wraps with ThemeProvider + AuthProvider
  index.css             - Global styles + 4 CSS theme variable overrides
  components/
    LandingPage.tsx     - Marketing landing page
    Dashboard.tsx       - Main app dashboard (authenticated)
    ProfilePage.tsx     - Profile page: username edit, theme picker, delete account
    AddProductModal.tsx - Add new product form
    ProductCard.tsx     - Product display card
    ProductDetailModal.tsx - Product detail view
    ListsPanel.tsx      - Manage saved lists
    ListCard.tsx        - List card with product previews
    AuthModal.tsx       - Sign in / sign up modal with Google auth + username
    SharedListView.tsx  - Public shared list view
    SharedProductView.tsx - Public shared product view
    CompareModal.tsx    - Product comparison modal
    BookmarkletModal.tsx - Browser bookmarklet helper
    NotificationsPanel.tsx - Price drop notifications
  contexts/
    AuthContext.tsx     - Firebase auth: signIn, signUp, signInWithGoogle, signOut, deleteAccount, refreshProfile
    ThemeContext.tsx    - 4 colour themes (Charcoal/Plum Noir/Quiet Luxury/Midnight Classic), localStorage persisted
  lib/
    firebase.ts         - Firebase app + Auth + Firestore client
    firestore.ts        - Firestore data access helpers
    types.ts            - TypeScript types
    refreshProduct.ts   - Re-scrape logic for price refresh
server/
  proxy.js              - Scraping proxy (dev port 3001); serves dist/ in production (port 5000 / PORT)
```

## Themes

Four built-in colour schemes (Profile page, persisted in localStorage):

1. **Charcoal** (default) — `#111827` / white / gray-50  
2. **Plum Noir** — `#3D1C3A` / `#F5ECD7` Champagne  
3. **Quiet Luxury** — `#3B2314` Chocolate / `#F0D5C8` Blush  
4. **Midnight Classic** — `#1A1A1A` / `#FAF6EF` Ivory + gold accents  

## Environment variables

Copy `.env.example` to `.env` (or `.env.local`) and fill in values from the [Firebase console](https://console.firebase.google.com/) (Project settings → Your apps → Web app).

**Firestore security rules** — if you see `Missing or insufficient permissions` when saving products or adding them to lists, open **Firebase console → Firestore Database → Rules**, paste the contents of [`firestore.rules`](./firestore.rules) from this repo, and **Publish**. (Or run `firebase deploy --only firestore:rules` from a machine with the [Firebase CLI](https://firebase.google.com/docs/cli) linked to the same project.)

**Composite indexes** — `list_products` queries filter by `list_id` + `user_id` (and `product_id` + `user_id`). Deploy [`firestore.indexes.json`](./firestore.indexes.json) with `firebase deploy --only firestore:indexes`, or create the suggested composite indexes from the link in the browser console if Firestore reports a missing index.

**Client (Vite)** — must be prefixed with `VITE_`:

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

**Scrape proxy (`server/proxy.js`)** — set in the shell or a root `.env` loaded by your process manager (not bundled into the Vite client):

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for LLM fallback when scraping fails |
| `OPENAI_BASE_URL` | Optional custom OpenAI-compatible API base URL |

Legacy alias (still supported): `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL`.

Optional residential Pi proxy (see `pi-proxy/README.md`): `RESIDENTIAL_PROXY_URL`, `RESIDENTIAL_PROXY_KEY`.

## Development

Run two processes locally:

1. **App** — Vite on port 5000: `npm run dev`  
2. **Scrape proxy** — `node server/proxy.js` on port 3001  

Vite proxies `/api/*` to `http://localhost:3001`.

## Deployment

```bash
npm run build && npm start
```

- `npm start` sets `NODE_ENV=production` and runs `server/proxy.js`.  
- In production the proxy serves `dist/` and SPA fallback; `/api/*` stays on the same host/port.  
- Listen port: `PORT` (default `5000`).  

**Vercel + separate API host:** step-by-step guide for a production PWA on Vercel and an always-on scrape server is in [`docs/VERCEL_PRODUCTION.md`](./docs/VERCEL_PRODUCTION.md). Set `VITE_SCRAPE_API_URL` on Vercel to your hosted API origin (see `.env.example`).

## Notes

- Usernames live in Firestore `profiles` documents.  
- Google sign-in needs the Google provider enabled in Firebase Authentication.  
