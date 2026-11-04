import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * A task's three versions side by side, as an ESchema has them: fields
 * only. Making it an EntityESchema adds one line, the id, to every version
 * at once, lit in the accent. Then a fourth version tries to change the
 * id, and is refused: the id belongs to the builder, and no version may
 * touch it. The id's line and the refusal keep their room from the start,
 * so the cards never grow.
 */

const STEPS = [
  {
    id: false,
    refused: false,
    caption:
      'As an ESchema, a task is a name, its fields and its versions. No id yet.',
  },
  {
    id: true,
    refused: false,
    caption:
      'As an EntityESchema, the builder adds taskId to every version at once.',
  },
  {
    id: true,
    refused: true,
    caption:
      'A later version that tries to change taskId is refused: it does not compile.',
  },
] as const;
const CAPTIONS = STEPS.map((each) => each.caption);

const VERSIONS = [
  { version: 'v1', fields: ['boardId', 'title'] },
  { version: 'v2', fields: ['boardId', 'title', 'priority'] },
  { version: 'v3', fields: ['boardId', 'title', 'priority', 'done'] },
] as const;

export function IdPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8">
        <div className="mx-auto grid max-w-md grid-cols-3 items-start gap-2 sm:gap-3">
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
                <motion.li
                  initial={false}
                  animate={
                    now.id ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }
                  }
                  transition={now.id ? ENTER : EXIT}
                  aria-hidden={!now.id}
                  className="font-medium text-(--field-accent)"
                >
                  taskId
                </motion.li>
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
                className="rounded-full border border-red-500 px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-red-600 dark:text-red-400"
              >
                .evolve('v4', {'{ taskId: … }'})
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Walkthrough>
  );
}
