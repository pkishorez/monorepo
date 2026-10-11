import { workName } from '../step/index.ts';
import type { WorkerRow } from '../step/index.ts';

const TONE: Record<WorkerRow['life'], string> = {
  started: 'border-positive/50 bg-positive/10 text-positive',
  stopped:
    'border-destructive/40 bg-destructive/10 text-destructive line-through',
  kept: 'border-border bg-muted text-muted-foreground',
};

const TITLE: Record<WorkerRow['life'], string> = {
  started: 'Started: its Condition holds from this Step on',
  stopped: 'Stopped: its Condition no longer holds',
  kept: 'Running: its Condition held before and still does',
};

/** An Instance's Workers as tags: one per key, green where the Step started it, red and struck where it stopped it. */
export const WorkerTags = ({
  workers,
}: {
  readonly workers: ReadonlyArray<WorkerRow>;
}) => (
  <ul className="flex flex-wrap gap-1">
    {workers.map((worker) => (
      <li
        key={`${worker.name}#${worker.key}`}
        title={TITLE[worker.life]}
        className={`rounded-md border px-1.5 py-px font-mono text-[10px] ${TONE[worker.life]}`}
      >
        {workName(worker.name, worker.key)}
      </li>
    ))}
  </ul>
);
