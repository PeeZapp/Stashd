import { useState, useEffect, useRef } from 'react';
import { scrapeApiUrl } from '../lib/scrapeApiBase';

export type ProxyState = 'unconfigured' | 'unreachable' | 'reachable';

export function useProxyStatus(): ProxyState {
  const [state, setState] = useState<ProxyState>('unconfigured');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = async () => {
    try {
      const res = await fetch(scrapeApiUrl('/api/proxy-status'), {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return;
      const { configured, reachable } = await res.json();
      if (!configured) setState('unconfigured');
      else if (reachable) setState('reachable');
      else setState('unreachable');
    } catch {
      // network hiccup — keep current state
    }
  };

  useEffect(() => {
    poll();
    const interval = state === 'reachable' ? 30000 : 10000;
    intervalRef.current = setInterval(poll, interval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state]);

  return state;
}
