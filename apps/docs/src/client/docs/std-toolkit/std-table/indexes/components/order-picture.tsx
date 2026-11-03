import { motion } from 'motion/react';
import { Pill, useSteps } from '../../../../../components/index.ts';

/*
 * The same tasks, read three ways. The primary key lists a board by id;
 * byTitle lists the same board by title; byPriority gathers the
 * high-priority tasks from every board. The rows glide into each order; a task the
 * index does not hold fades back.
 */

type Task = {
  readonly id: string;
  readonly board: string;
  readonly title: string;
  readonly priority: string;
};

const TASKS: ReadonlyArray<Task> = [
  { id: 't1', board: 'work', title: 'Water', priority: 'high' },
  { id: 't2', board: 'work', title: 'Plan', priority: 'low' },
  { id: 't3', board: 'work', title: 'Call', priority: 'high' },
  { id: 't4', board: 'home', title: 'Fix', priority: 'high' },
];

type View = {
  readonly name: string;
  readonly query: string;
  readonly keep: (task: Task) => boolean;
  readonly by: (task: Task) => string;
};

const VIEWS: ReadonlyArray<View> = [
  {
    name: 'primary',
    query: "{ boardId: 'work' }",
    keep: (task) => task.board === 'work',
    by: (task) => task.id,
  },
  {
    name: 'byTitle',
    query: "{ boardId: 'work' }",
    keep: (task) => task.board === 'work',
    by: (task) => task.title,
  },
  {
    name: 'byPriority',
    query: "{ priority: 'high' }",
    keep: (task) => task.priority === 'high',
    by: (task) => `${task.board}#${task.title}`,
  },
];
const DURATIONS = [2200, 2200, 2600];

export function OrderPicture() {
  const [ref, step] = useSteps(DURATIONS, 1);
  const view = VIEWS[step]!;
  const order = [...TASKS].sort((a, b) => {
    const kept = Number(view.keep(b)) - Number(view.keep(a));
    if (kept !== 0) return kept;
    return view.by(a) < view.by(b) ? -1 : 1;
  });
  return (
    <div ref={ref} className="grid place-items-center px-4 py-8">
      <div className="w-full max-w-72">
        <p className="flex h-7 items-center justify-center gap-2">
          <Pill className="font-medium">{view.name}</Pill>
          <span className="font-mono text-[11px] text-muted-foreground">
            {view.query}
          </span>
        </p>
        <ul className="mt-4 space-y-1.5">
          {order.map((task) => (
            <motion.li
              key={task.id}
              layout
              animate={{ opacity: view.keep(task) ? 1 : 0.25 }}
              transition={{ duration: 0.4, ease: [0.77, 0, 0.175, 1] }}
              className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-[11.5px]"
            >
              <span>
                <span className="text-muted-foreground">{task.id} </span>
                {task.title}
              </span>
              <span className="text-muted-foreground">
                {task.board} · {task.priority}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}
