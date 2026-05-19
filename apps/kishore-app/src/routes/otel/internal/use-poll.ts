import { Effect } from 'effect';
import { useEffect, useState } from 'react';
import type { OtelCollections } from './collections';

const POLL_INTERVAL_MS = 1000;

export function usePoll(collections: OtelCollections) {
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        await Promise.all([
          Effect.runPromise(collections.traces.utils.fetchMore()),
          Effect.runPromise(collections.logs.utils.fetchMore()),
        ]);
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    };

    void tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [collections]);

  return { error };
}
