import { useState, useEffect } from 'react';
import { scrapeApiUrl } from '../lib/scrapeApiBase';
import { warmupScrapeService } from '../lib/warmupScrapeService';

export type PlaywrightState = 'idle' | 'launching' | 'ready';

/** When the Node proxy (port 3001) is not running, avoid hammering Vite with ECONNREFUSED logs. */
const POLL_MS_READY = 30_000;
const POLL_MS_WARMING = 1_500;
const POLL_MS_PROXY_DOWN = 10_000;

export function usePlaywrightStatus(): PlaywrightState {
  const [state, setState] = useState<PlaywrightState>('idle');

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const schedule = (ms: number) => {
      timeoutId = setTimeout(run, ms);
    };

    async function run() {
      if (cancelled) return;
      let nextMs = POLL_MS_WARMING;
      try {
        const res = await fetch(scrapeApiUrl('/api/playwright-status'), {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) {
          nextMs = POLL_MS_PROXY_DOWN;
        } else {
          const { ready, launching } = await res.json();
          const nextState: PlaywrightState = ready ? 'ready' : launching ? 'launching' : 'idle';
          setState(nextState);
          nextMs = nextState === 'ready' ? POLL_MS_READY : POLL_MS_WARMING;
        }
      } catch {
        nextMs = POLL_MS_PROXY_DOWN;
      }
      if (!cancelled) schedule(nextMs);
    }

    void warmupScrapeService();
    run();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return state;
}
