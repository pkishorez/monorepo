import { useEffect, useRef, useState } from 'react';
import type { ProofReport, StoryTree } from 'laymos/story/schema';

import { inScope, proofsBeneath } from '../story-scope';

type Reports = Readonly<Record<string, ProofReport>>;

/** Plays a Stories run against canned reports: every Proof in scope starts, then finishes one by one. */
export function useSimulatedRun(
  tree: StoryTree,
  canned: Reports,
  initial: Reports = {},
) {
  const [reports, setReports] = useState<Reports>(initial);
  const [running, setRunning] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  /** Settles once the last Proof of the run finishes. */
  const onRun = (scope?: string) => {
    const ids = proofsBeneath(tree)
      .map((proof) => proof.id)
      .filter((id) => inScope(id, scope));
    setRunning((current) => new Set([...current, ...ids]));
    let ended = () => {};
    const ending = new Promise<void>((resolve) => {
      ended = resolve;
    });
    ids.forEach((id, index) => {
      timers.current.push(
        setTimeout(
          () => {
            const report = canned[id];
            if (report !== undefined) {
              setReports((current) => ({
                ...current,
                [id]: { ...report, startedAt: Date.now() },
              }));
            }
            setRunning((current) => {
              const next = new Set(current);
              next.delete(id);
              return next;
            });
            if (index === ids.length - 1) ended();
          },
          900 + index * 420,
        ),
      );
    });
    if (ids.length === 0) ended();
    return ending;
  };

  return { reports, running, onRun };
}
