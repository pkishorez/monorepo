import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * Two tabs of one app over one shared store. Tab 1 leads: it alone reads
 * the Backend. Tab 2 adds a task; it shows there at once, marked as
 * saving, until the Backend confirms it. The confirmed task goes into the
 * shared store, the Doorbell rings, and Tab 1 shows it too. Then the
 * network goes: both tabs keep the board. Tab 1 renames a task; the
 * Backend can't be reached, so the rename is undone. The network comes
 * back, and reading resumes. Each tab keeps a place for its third task
 * from the start, and the Doorbell its place in the store, so only what
 * a step changes moves.
 */

type Row = { readonly title: string; readonly saving?: boolean };

type Step = {
  /** Each tab's third task, the one this picture adds and renames. */
  readonly one?: Row;
  readonly two?: Row;
  readonly stored: number;
  readonly offline?: boolean;
  readonly bell?: boolean;
  /** Which tab this step lights. */
  readonly lit?: 'one' | 'two';
  readonly caption: string;
};

const BASE = ['Plan the week', 'Water the plants'];
const CALL: Row = { title: 'Call home' };

const STEPS: ReadonlyArray<Step> = [
  {
    stored: 2,
    caption:
      'Two tabs share one store in IndexedDB. Tab 1 leads, so only it reads the Backend.',
  },
  {
    two: { title: 'Call home', saving: true },
    stored: 2,
    caption: 'Tab 2 adds a task. It shows there at once, marked as saving.',
  },
  {
    two: CALL,
    stored: 3,
    bell: true,
    caption:
      'The Backend confirms it. It goes into the shared store, and the Doorbell rings.',
  },
  {
    one: CALL,
    two: CALL,
    stored: 3,
    lit: 'one',
    caption:
      'Tab 1 hears the Doorbell, reads the store again, and shows it too.',
  },
  {
    one: CALL,
    two: CALL,
    stored: 3,
    offline: true,
    caption: 'The network goes. Both tabs keep the board they already have.',
  },
  {
    one: { title: 'Call mum', saving: true },
    two: CALL,
    stored: 3,
    offline: true,
    caption: 'Tab 1 renames a task. It shows at once, marked as saving.',
  },
  {
    one: CALL,
    two: CALL,
    stored: 3,
    offline: true,
    lit: 'one',
    caption: 'The Backend can’t be reached, so the rename is undone.',
  },
  {
    one: CALL,
    two: CALL,
    stored: 3,
    caption: 'The network comes back, and Tab 1 reads the Backend again.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

const line =
  'rounded border px-1.5 text-[10.5px] leading-[18px] whitespace-nowrap';

function Tab({
  name,
  leads,
  third,
  flash,
}: {
  readonly name: string;
  readonly leads: boolean;
  readonly third: Row | undefined;
  readonly flash?: number;
}) {
  return (
    <div className="relative min-w-0 rounded-lg border border-border bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1">
        <span className="text-[11px] font-medium">{name}</span>
        {leads && (
          <span className="ml-auto rounded-full border border-border px-1.5 font-mono text-[9.5px] text-muted-foreground">
            leads
          </span>
        )}
      </div>
      <ul className="space-y-1 overflow-hidden p-2">
        {BASE.map((title) => (
          <li key={title} className={`${line} truncate border-border`}>
            {title}
          </li>
        ))}
        <motion.li
          initial={false}
          animate={third ? { opacity: 1, y: 0 } : { opacity: 0, y: 3 }}
          transition={third ? ENTER : EXIT}
          aria-hidden={!third}
          className={`${line} grid transition-colors duration-300 ${third?.saving ? 'border-dashed border-(--field-accent) text-muted-foreground' : 'border-border'}`}
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={third?.title ?? CALL.title}
              className="truncate [grid-area:1/1]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
            >
              {third?.title ?? CALL.title}
            </motion.span>
          </AnimatePresence>
        </motion.li>
      </ul>
      <Flash at={flash} />
    </div>
  );
}

export function TabsPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  const back = step === STEPS.length - 1;
  return (
    <Walkthrough walk={walk}>
      <div className="px-3 py-8 sm:px-8">
        <div className="mx-auto max-w-md">
          <div className="mb-3 flex items-center justify-center gap-2 text-[11px]">
            <span className="font-medium">Backend</span>
            <span
              className={`rounded-full border px-1.5 font-mono text-[10px] transition-colors duration-300 ${now.offline ? 'border-red-500 text-red-600 dark:text-red-400' : back ? 'border-(--field-accent) text-(--field-accent)' : 'border-border text-muted-foreground'}`}
            >
              {now.offline ? 'offline' : 'online'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Tab
              name="Tab 1"
              leads
              third={now.one}
              flash={now.lit === 'one' ? round * 10 + step : undefined}
            />
            <Tab name="Tab 2" leads={false} third={now.two} />
          </div>
          <div className="mx-auto h-4 w-px bg-border" />
          <div className="relative flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[11px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <span className="font-medium whitespace-nowrap">Sync Store</span>
            <span className="flex items-center gap-2 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
              <motion.span
                initial={false}
                animate={
                  now.bell
                    ? { opacity: 1, scale: 1 }
                    : { opacity: 0, scale: 0.95 }
                }
                transition={now.bell ? ENTER : EXIT}
                aria-hidden={!now.bell}
                className="rounded bg-(--field-accent) px-1 text-background"
              >
                Doorbell
              </motion.span>
              IndexedDB · {now.stored} tasks
            </span>
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
