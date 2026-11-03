import { motion } from 'motion/react';
import { Flash, SPRING, useSteps } from '../../../../../components/index.ts';

/*
 * std-toolkit as five layers, one on the next, and a task travelling down
 * through them, one at a time. Beside each layer, what the task is there:
 * a shape with versions, an entity found by its key, a row in the one
 * table, the same row on any database, and a fresh copy on a screen. The
 * layer the task is in is lit; the rest wait.
 */

const LAYERS = [
  { part: 'Evolving schema', task: 'Task · v1 → v2 → v3' },
  { part: 'Entities', task: 'task.get({ boardId, taskId })' },
  { part: 'StdTable', task: "pk 'Task#work' · sk 't1'" },
  { part: 'Adapters', task: 'Memory · IndexedDB · SQLite · DynamoDB' },
  { part: 'Sync', task: 'a fresh copy on every screen' },
] as const;
const DURATIONS = [1700, 1700, 1700, 1700, 2200];

export function LayersPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 4);
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <ol className="mx-auto grid max-w-lg gap-2">
        {LAYERS.map((layer, index) => {
          const lit = index === step;
          return (
            <li
              key={layer.part}
              className={`relative grid grid-cols-[1.5rem_8.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg border px-3 py-2.5 transition-[border-color,opacity] duration-300 ${lit ? 'border-foreground/70 opacity-100' : 'border-border opacity-55'}`}
            >
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <span className="text-[13px] font-medium">{layer.part}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {layer.task}
              </span>
              {lit && (
                <motion.span
                  layoutId={`layers-${round}`}
                  transition={SPRING}
                  aria-hidden
                  className="absolute top-1/2 -left-1.5 size-3 -translate-y-1/2 rounded-full bg-(--field-accent)"
                />
              )}
              {lit && <Flash at={round * 10 + index + 1} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
