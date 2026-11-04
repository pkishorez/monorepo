import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * A page with three tasks, and the IndexedDB Store under it that holds
 * them. The page reloads: its list fades out, and the Store does not
 * move. The page opens again; first setup checks the table against the
 * Stored contract, then the tasks are read back, all three. The list
 * keeps its rows' room while it is blank, so nothing moves but them.
 */

const TASKS = ['Plan the week', 'Water the plants', 'Call home'];

type Step = {
  readonly shown: boolean;
  readonly checked: boolean;
  readonly caption: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    shown: true,
    checked: false,
    caption:
      'The page shows three tasks. The IndexedDB Store under it keeps them.',
  },
  {
    shown: false,
    checked: false,
    caption:
      'The page reloads and its list goes blank. The Store does not move.',
  },
  {
    shown: false,
    checked: true,
    caption:
      'On the next open, setup checks the table against the Stored contract. It matches.',
  },
  {
    shown: true,
    checked: true,
    caption: 'The tasks read back from the Store. All three are still there.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

export function ReloadPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-sm">
          <div className="relative rounded-lg border border-border bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
              <span className="size-2 rounded-full bg-border" />
              <span className="size-2 rounded-full bg-border" />
              <span className="size-2 rounded-full bg-border" />
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                my-app
              </span>
            </div>
            <ul className="space-y-1.5 p-3">
              {TASKS.map((title, index) => (
                <motion.li
                  key={title}
                  initial={false}
                  animate={
                    now.shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }
                  }
                  transition={
                    now.shown ? { ...ENTER, delay: index * 0.06 } : EXIT
                  }
                  className="rounded-md border border-border px-2.5 py-1 text-[12px]"
                >
                  {title}
                </motion.li>
              ))}
            </ul>
            <Flash {...(step === 3 ? { at: round * 10 + 3 } : {})} />
          </div>
          <div className="mx-auto h-6 w-px bg-border" />
          <div className="relative rounded-lg border border-border bg-background px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <p className="flex items-center justify-between gap-2 text-[12px]">
              <span className="font-medium">IndexedDB</span>
              <span className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                store 'board' · 3 rows
              </span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              _std_contract
              <motion.span
                initial={false}
                animate={
                  now.checked
                    ? { opacity: 1, scale: 1 }
                    : { opacity: 0, scale: 0.95 }
                }
                transition={now.checked ? ENTER : EXIT}
                aria-hidden={!now.checked}
                className="rounded bg-foreground px-1 text-background"
              >
                matches
              </motion.span>
            </p>
            <Flash {...(step === 2 ? { at: round * 10 + 2 } : {})} />
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
