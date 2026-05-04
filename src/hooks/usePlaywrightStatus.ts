import { useState, useEffect } from 'react';
import { scrapeApiUrl } from '../lib/scrapeApiBase';

export type PlaywrightState = 'idle' | 'launching' | 'ready';

/** When the Node proxy (port 3001) is not running, polling every 3s floods Vite with ECONNREFUSED logs. */
const POLL_MS_READY = 30_000;
const POLL_MS_ACTIVE = 3_000;
const POLL_MS_PROXY_DOWN = 30_000;

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
      let nextMs = POLL_MS_ACTIVE;
      try {
        const res = await fetch(scrapeApiUrl('/api/playwright-status'), {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) {
          nextMs = POLL_MS_PROXY_DOWN;
        } else {
          const { ready, launching } = await res.json();
          setState(ready ? 'ready' : launching ? 'launching' : 'idle');
          nextMs = ready ? POLL_MS_READY : POLL_MS_ACTIVE;
        }
      } catch {
        nextMs = POLL_MS_PROXY_DOWN;
      }
      if (!cancelled) schedule(nextMs);
    }

    run();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return state;
}
