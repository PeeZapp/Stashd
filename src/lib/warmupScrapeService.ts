import { scrapeApiUrl } from './scrapeApiBase';

/** Wake the scrape API and start Chromium launch if it is not already running. */
export async function warmupScrapeService(): Promise<void> {
  try {
    await fetch(scrapeApiUrl('/api/health'), { signal: AbortSignal.timeout(8000) });
  } catch {
    // Server may still be cold-starting — try warmup anyway.
  }
  try {
    await fetch(scrapeApiUrl('/api/warmup'), {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Best effort — status polling will retry.
  }
}
