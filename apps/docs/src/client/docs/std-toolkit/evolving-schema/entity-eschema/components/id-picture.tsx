import { AnimatePresence, motion } from 'motion/react';
import { ENTER, EXIT, useSteps } from '../../../../../components/index.ts';

/*
 * A task's three versions side by side, as an ESchema has them: fields
 * only. Making it an EntityESchema adds one line, the id, to every version
 * at once. Then a fourth version tries to change the id, and is refused:
 * the id belongs to the builder, and no version may touch it.
 */

type Step = {
  readonly id: boolean;
  readonly refused: boolean;
  readonly rule: string;
};

const STEPS: ReadonlyArray<Step> = [
  { id: false, refused: false, rule: 'ESchema: a name, fields, versions' },
  {
    id: true,
    refused: false,
    rule: 'EntityESchema: the same, plus taskId in every version',
  },
  {
    id: true,
    refused: true,
    rule: 'evolve that touches taskId: refused, it does not compile',
  },
];
const DURATIONS = [1800, 2400, 2400];

const VERSIONS = [
  { version: 'v1', fields: ['boardId', 'title'] },
  { version: 'v2', fields: ['boardId', 'title', 'priority'] },
  { version: 'v3', fields: ['boardId', 'title', 'priority', 'done'] },
] as const;

export function IdPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 1);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="px-4 py-8">
      <div className="mx-auto grid max-w-md grid-cols-3 gap-2 sm:gap-3">
        {VERSIONS.map(({ version, fields }) => (
          <div
            key={version}
            className="rounded-lg border border-border bg-background px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <p className="mb-1.5 flex items-center gap-1.5 text-[12px]">
              <span className="font-medium">Task</span>
              <span className="rounded bg-foreground px-1 font-mono text-[10px] text-background">
                {version}
              </span>
            </p>
            <ul className="font-mono text-[10.5px] leading-5 sm:text-[11px]">
              <AnimatePresence initial={false}>
                {now.id && (
                  <motion.li
                    key={`id-${round}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 20, transition: ENTER }}
                    exit={{ opacity: 0, height: 0, transition: EXIT }}
                    className="overflow-hidden font-medium text-(--field-accent)"
                  >
                    taskId
                  </motion.li>
                )}
              </AnimatePresence>
              {fields.map((field) => (
                <li key={field} className="text-muted-foreground">
                  {field}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-4 flex h-7 justify-center">
        <AnimatePresence>
          {now.refused && (
            <motion.span
              key={`refused-${round}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{
                opacity: 1,
                y: 0,
                x: [0, -6, 6, -4, 4, 0],
                transition: { duration: 0.45 },
              }}
              exit={{ opacity: 0, transition: EXIT }}
              className="rounded-full border border-red-500 px-2.5 py-0.5 font-mono text-[11px] text-red-600 dark:text-red-400"
            >
              .evolve('v4', {'{ taskId: … }'})
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p className="mt-2 h-4 text-center font-mono text-[11px] text-muted-foreground">
        <AnimatePresence mode="wait">
          <motion.span
            key={`${round}-${step}`}
            className="inline-block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: ENTER }}
            exit={{ opacity: 0, transition: EXIT }}
          >
            {now.rule}
          </motion.span>
        </AnimatePresence>
      </p>
    </div>
  );
}
