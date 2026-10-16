import { AnimatePresence, motion } from 'motion/react';
import { ENTER, EXIT, MOVE, useSteps } from './parts.tsx';

/*
 * Rewind anything: a shopping list, and the log of Messages that made it,
 * like git commits, the Head at the last one. The Head steps back three
 * Messages, one at a time, and the list goes back with it. Then two new
 * Messages grow a Branch from there, and the list moves on along it.
 */

type Item = { readonly name: string; readonly checked: boolean };
type Commit = {
  readonly label: string;
  readonly apply: (list: ReadonlyArray<Item>) => ReadonlyArray<Item>;
};

const added =
  (name: string): Commit['apply'] =>
  (list) => [...list, { name, checked: false }];
const checked =
  (name: string): Commit['apply'] =>
  (list) =>
    list.map((item) =>
      item.name === name ? { ...item, checked: true } : item,
    );

const MAIN: ReadonlyArray<Commit> = [
  { label: 'Added milk', apply: added('milk') },
  { label: 'Added eggs', apply: added('eggs') },
  { label: 'Added bread', apply: added('bread') },
  { label: 'Checked milk', apply: checked('milk') },
  { label: 'Added tea', apply: added('tea') },
];
/** Where the Branch starts on the main line. */
const FORK = 1;
const BRANCH: ReadonlyArray<Commit> = [
  { label: 'Added coffee', apply: added('coffee') },
  { label: 'Checked eggs', apply: checked('eggs') },
];

/** Live, back one at a time to the fork, on along the Branch, then out. */
const STEPS = [1800, 260, 260, 1400, 900, 2400, 400];
/** The Head at each step: how far along the main line, then the Branch. */
const HEADS = [
  { main: 4, branch: -1 },
  { main: 3, branch: -1 },
  { main: 2, branch: -1 },
  { main: 1, branch: -1 },
  { main: FORK, branch: 0 },
  { main: FORK, branch: 1 },
];

const ROW = 26;
const LANES = [10, 26];
const y = (row: number) => row * ROW + ROW / 2;

export function Rewind() {
  const [ref, step, round] = useSteps(STEPS, 5);
  const leaving = step === STEPS.length - 1;
  const head = HEADS[leaving ? HEADS.length - 1 : step]!;
  const rewound = head.main < MAIN.length - 1;
  const path = [
    ...MAIN.slice(0, head.main + 1),
    ...BRANCH.slice(0, head.branch + 1),
  ];
  const list = path.reduce<ReadonlyArray<Item>>(
    (items, commit) => commit.apply(items),
    [],
  );
  const at =
    head.branch >= 0
      ? { x: LANES[1]!, y: y(MAIN.length + head.branch) }
      : { x: LANES[0]!, y: y(head.main) };
  return (
    <motion.div
      ref={ref}
      animate={
        leaving
          ? { opacity: 0, transition: EXIT }
          : { opacity: 1, transition: ENTER }
      }
      className="w-full max-w-80"
    >
      {/* Drawn afresh each time around, so nothing slides back to the start. */}
      <div key={round} className="flex gap-6">
        <div className="relative flex-1">
          <svg
            width={36}
            height={(MAIN.length + BRANCH.length) * ROW}
            className="absolute top-0 left-0 text-foreground"
          >
            <line
              x1={LANES[0]}
              y1={y(0)}
              x2={LANES[0]}
              y2={y(MAIN.length - 1)}
              className="stroke-border"
            />
            <motion.path
              d={`M ${LANES[0]} ${y(FORK)} C ${LANES[0]} ${y(FORK + 2)}, ${LANES[1]} ${y(MAIN.length - 1)}, ${LANES[1]} ${y(MAIN.length)} L ${LANES[1]} ${y(MAIN.length + 1)}`}
              fill="none"
              className="stroke-border"
              initial={false}
              animate={{ pathLength: head.branch >= 0 ? 1 : 0 }}
              transition={MOVE}
            />
            {MAIN.map((commit, row) => (
              <motion.circle
                key={commit.label}
                cx={LANES[0]}
                cy={y(row)}
                r={3.5}
                fill="currentColor"
                initial={false}
                animate={{ opacity: row > head.main ? 0.2 : 1 }}
                transition={ENTER}
              />
            ))}
            {BRANCH.map((commit, index) => (
              <motion.circle
                key={commit.label}
                cx={LANES[1]}
                cy={y(MAIN.length + index)}
                r={3.5}
                fill="currentColor"
                initial={false}
                animate={{ opacity: index <= head.branch ? 1 : 0 }}
                transition={ENTER}
              />
            ))}
            <motion.circle
              r={7.5}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              initial={false}
              animate={{ cx: at.x, cy: at.y }}
              // A step back is quick; the move onto the Branch takes its time.
              transition={{ ...MOVE, duration: head.branch >= 0 ? 0.4 : 0.22 }}
            />
          </svg>
          <ol className="pl-11 font-mono text-[11px]">
            {[...MAIN, ...BRANCH].map((commit, row) => {
              const onBranch = row >= MAIN.length;
              const shown = onBranch
                ? row - MAIN.length <= head.branch
                : !rewound || row <= head.main;
              const isHead = commit === path[path.length - 1];
              return (
                <motion.li
                  key={commit.label}
                  initial={false}
                  animate={{
                    opacity: shown ? 1 : onBranch ? 0 : 0.35,
                    x: shown || !onBranch ? 0 : -4,
                  }}
                  transition={ENTER}
                  style={{ height: ROW }}
                  className={`flex items-center whitespace-nowrap ${isHead ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                >
                  {commit.label}
                </motion.li>
              );
            })}
          </ol>
        </div>
        <div className="w-28 shrink-0 rounded-lg border border-border bg-background p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="mb-2 text-xs font-medium">Groceries</p>
          <ul className="space-y-1.5 text-xs">
            <AnimatePresence initial={false} mode="popLayout">
              {list.map((item) => (
                <motion.li
                  key={item.name}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0, transition: ENTER }}
                  exit={{ opacity: 0, transition: EXIT }}
                  className="flex items-center gap-2"
                >
                  <span
                    className={`grid size-3 shrink-0 place-items-center rounded-[3px] border transition-colors duration-150 ${item.checked ? 'border-foreground bg-foreground' : 'border-foreground/30'}`}
                  />
                  <span
                    className={`transition-colors duration-150 ${item.checked ? 'text-muted-foreground line-through' : ''}`}
                  >
                    {item.name}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </div>
    </motion.div>
  );
}
