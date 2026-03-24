# Stashd

A universal product wishlist app — save items from any store, track prices and sales, organize into lists, and share with friends.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend/Auth/DB**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Icons**: Lucide React
- **Scraping**: Node.js proxy (`server/proxy.js`) with Playwright/Chromium headless browser fallback for bot-protected sites, plus OpenAI LLM fallback for hard-to-parse pages

## Project Structure

```
src/
  App.tsx               - Root component with basic client-side routing
  main.tsx              - Entry point
  index.css             - Global styles
  components/
    LandingPage.tsx     - Marketing landing page
    Dashboard.tsx       - Main app dashboard (authenticated)
    AddProductModal.tsx - Add new product form
    ProductCard.tsx     - Product display card
    ProductDetailModal.tsx - Product detail view
    ListsPanel.tsx      - Manage saved lists
    AuthModal.tsx       - Sign in / sign up modal
    SharedListView.tsx  - Public shared list view
    SharedProductView.tsx - Public shared product view
  contexts/
    AuthContext.tsx     - Supabase auth context
  lib/
    supabase.ts         - Supabase client
    types.ts            - TypeScript types
supabase/
  migrations/           - Database schema migrations
  functions/
    scrape_product/     - Edge function to scrape product info
```

## Environment Variables

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous/public key

## Development

The app runs on port 5000 via Vite dev server (`npm run dev`).

## Deployment

Configured as a **static** deployment:
- Build: `npm run build`
- Public directory: `dist`
