import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product, Profile } from '../lib/types';
import { detailedEnrichProduct } from '../lib/detailedEnrichProduct';

const SCHEDULE_STORAGE_KEY = 'stashd:lastScheduledDetailedEnrichDate';

/**
 * Runs detailed add (fetch product-page details) for quick-add URLs in the background,
 * when the user chooses idle or scheduled processing from Profile.
 */
export function useDetailedEnrichmentRunner(options: {
  getPending: () => Product[];
  userId: string | undefined;
  profile: Profile | null;
  enabled: boolean;
  onAfterItem: () => void | Promise<void>;
}) {
  const { getPending, userId, profile, enabled, onAfterItem } = options;
  const getPendingRef = useRef(getPending);
  getPendingRef.current = getPending;

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const processingRef = useRef(false);

  const runBatch = useCallback(async () => {
    if (!userId || processingRef.current) return;
    const initial = getPendingRef.current();
    if (initial.length === 0) return;

    processingRef.current = true;
    setRunning(true);
    const totalPlanned = initial.length;
    try {
      let done = 0;
      while (true) {
        const remaining = getPendingRef.current();
        if (remaining.length === 0) break;
        const p = remaining[0];
        done += 1;
        setProgress({ current: done, total: totalPlanned });
        await detailedEnrichProduct(p);
        await onAfterItem();
        await new Promise((r) => setTimeout(r, 1200));
      }
    } finally {
      setProgress(null);
      setRunning(false);
      processingRef.current = false;
    }
  }, [userId, onAfterItem]);

  // When tab is hidden: optional idle batch (delayed start)
  useEffect(() => {
    if (!enabled || !profile?.detailed_enrichment_when_idle || !userId) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        t = setTimeout(() => {
          void runBatch();
        }, 10_000);
      } else if (t) {
        clearTimeout(t);
        t = undefined;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (t) clearTimeout(t);
    };
  }, [enabled, profile?.detailed_enrichment_when_idle, userId, runBatch]);

  // Daily local-time slot (fires near the start of the chosen hour)
  useEffect(() => {
    const hour = profile?.detailed_enrichment_schedule_hour;
    if (!enabled || hour == null || hour < 0 || hour > 23 || !userId) return;

    const tick = () => {
      const now = new Date();
      if (now.getHours() !== hour) return;
      const dayKey = `${now.toDateString()}-h${hour}`;
      if (sessionStorage.getItem(SCHEDULE_STORAGE_KEY) === dayKey) return;
      sessionStorage.setItem(SCHEDULE_STORAGE_KEY, dayKey);
      void runBatch();
    };

    const id = setInterval(tick, 60_000);
    tick();
    return () => clearInterval(id);
  }, [enabled, profile?.detailed_enrichment_schedule_hour, userId, runBatch]);

  return { running, progress, runBatch };
}
