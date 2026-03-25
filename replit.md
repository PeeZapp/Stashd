# Stashd

A universal product wishlist app — save items from any store, track prices and sales, organize into lists, and share with friends.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + CSS custom properties for theming
- **Backend/Auth/DB**: Firebase Auth + Firestore
- **Icons**: Lucide React
- **Scraping**: Node.js proxy (`server/proxy.js`) with Playwright/Chromium headless browser fallback for bot-protected sites, plus OpenAI LLM fallback for hard-to-parse pages

## Project Structure

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
  proxy.js              - Scraping proxy (dev port 3001); serves dist/ in production (port 5000/PORT)
```

## Themes

4 built-in colour schemes (toggled from Profile page, persisted to localStorage):
1. **Charcoal** (default) — `#111827` / white/gray-50
2. **Plum Noir** — `#3D1C3A` / `#F5ECD7` Champagne
3. **Quiet Luxury** — `#3B2314` Chocolate / `#F0D5C8` Blush
4. **Midnight Classic** — `#1A1A1A` / `#FAF6EF` Ivory + Gold accents

## Environment Variables

- `VITE_FIREBASE_API_KEY` - Firebase web API key
- `VITE_FIREBASE_AUTH_DOMAIN` - Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID` - Firebase project ID
- `VITE_FIREBASE_STORAGE_BUCKET` - Firebase storage bucket
- `VITE_FIREBASE_MESSAGING_SENDER_ID` - Firebase sender ID
- `VITE_FIREBASE_APP_ID` - Firebase app ID
- `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI via Replit integration

## Development

Two workflows run in parallel:
- **Start application** — Vite dev server on port 5000 (`npm run dev`)
- **Scrape proxy** — Node.js API proxy on port 3001 (`node server/proxy.js`)

Vite proxies `/api/*` to `localhost:3001`.

## Deployment

Production mode: `npm run build && npm start`
- `npm start` sets `NODE_ENV=production` and runs `server/proxy.js`
- In production, proxy serves `dist/` static files and handles SPA fallback
- API routes (`/api/*`) continue to work on the same process/port
- Listens on `PORT` env var (default 5000)

## Notes

- Username is stored in Firestore `profiles` documents
- Google OAuth requires Google provider enabled in Firebase Auth
