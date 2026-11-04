import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Roll,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * A task saved at v3, read by release 5, one step at a time. v4 renames
 * `title`: only the name rolls, lit in the accent, and 'Plan the week'
 * stays where it was. v5 removes `done`: its line fades, and `status`
 * fades in on the same line, carrying what `done` said. Last, the stored
 * row under the card lights: it is still v3. The two lines share one
 * grid cell, so the card never changes height.
 */

type Step = {
  readonly version: string;
  readonly renamed: boolean;
  readonly status: boolean;
  readonly caption: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    version: 'v3',
    renamed: false,
    status: false,
    caption: 'A task saved at v3, with a title, a priority and done.',
  },
  {
    version: 'v4',
    renamed: true,
    status: false,
    caption:
      "v4 renames title to name. The value, 'Plan the week', comes along.",
  },
  {
    version: 'v5',
    renamed: true,
    status: true,
    caption:
      "v5 removes done, and status takes its place: true becomes 'done'.",
  },
  {
    version: 'v5',
    renamed: true,
    status: true,
    caption:
      'Release 5 reads a v5 task, but the row in the database is still v3.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

const line = 'flex gap-2 [grid-area:1/1]';

export function RenamePicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step } = walk;
  const now = STEPS[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="grid place-items-center px-4 py-8">
        <div className="w-full max-w-60 rounded-lg border border-border bg-background px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px]">
            <span className="font-medium">Task</span>
            <span className="inline-grid rounded bg-foreground px-1 font-mono text-[10px] text-background">
              <Roll value={now.version} />
            </span>
          </p>
          <dl className="font-mono text-[11px] leading-5">
            <div className="flex gap-2">
              <dt
                className={`inline-grid transition-colors duration-700 ${step === 1 ? 'text-(--field-accent)' : 'text-muted-foreground'}`}
              >
                <Roll value={now.renamed ? 'name' : 'title'} />
              </dt>
              <dd>'Plan the week'</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">priority</dt>
              <dd>'high'</dd>
            </div>
            <div className="grid">
              <motion.div
                initial={false}
                animate={{ opacity: now.status ? 0 : 1 }}
                transition={now.status ? EXIT : ENTER}
                aria-hidden={now.status}
                className={line}
              >
                <dt className="text-muted-foreground">done</dt>
                <dd>true</dd>
              </motion.div>
              <motion.div
                initial={false}
                animate={{ opacity: now.status ? 1 : 0 }}
                transition={now.status ? { ...ENTER, delay: 0.15 } : EXIT}
                aria-hidden={!now.status}
                className={line}
              >
                <dt
                  className={`transition-colors duration-700 ${step === 2 ? 'text-(--field-accent)' : 'text-muted-foreground'}`}
                >
                  status
                </dt>
                <dd>'done'</dd>
              </motion.div>
            </div>
          </dl>
        </div>
        <p
          className={`mt-3 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-300 ${step === 3 ? 'border-(--field-accent) text-foreground' : 'border-transparent text-muted-foreground'}`}
        >
          stored row
          <span className="rounded bg-foreground px-1 font-mono text-[10px] text-background">
            v3
          </span>
        </p>
      </div>
    </Walkthrough>
  );
}
