import { useRef, useState } from 'react';
import type { StoryReport, StoryTree } from 'laymos';

import { storyIds, type StoryReports } from '../model';

export function useSimulatedRun(
  tree: StoryTree,
  allReports: Readonly<Record<string, StoryReport>>,
) {
  const [reports, setReports] = useState<StoryReports>();
  const [running, setRunning] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const onRun = (scope?: string) => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
    setRunning(true);
    const ids = storyIds(tree).filter(
      (id) => scope === undefined || id === scope || id.startsWith(`${scope}/`),
    );
    setReports((previous) =>
      scope === undefined
        ? {}
        : Object.fromEntries(
            Object.entries(previous ?? {}).filter(([id]) => !ids.includes(id)),
          ),
    );
    ids.forEach((id, index) => {
      timers.current.push(
        setTimeout(
          () => {
            const report = allReports[id];
            if (report !== undefined) {
              setReports((previous) => ({ ...previous, [id]: report }));
            }
            if (index === ids.length - 1) setRunning(false);
          },
          450 * (index + 1),
        ),
      );
    });
  };

  return { reports, running, onRun };
}
