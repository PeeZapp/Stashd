import { useState, useEffect, useRef } from 'react';

export type PlaywrightState = 'idle' | 'launching' | 'ready';

export function usePlaywrightStatus(): PlaywrightState {
  const [state, setState] = useState<PlaywrightState>('idle');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = async () => {
    try {
      const res = await fetch('/api/playwright-status', {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return;
      const { ready, launching } = await res.json();
      setState(ready ? 'ready' : launching ? 'launching' : 'idle');
    } catch {
      // network hiccup — keep current state
    }
  };

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, state === 'ready' ? 30000 : 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state]);

  return state;
}
