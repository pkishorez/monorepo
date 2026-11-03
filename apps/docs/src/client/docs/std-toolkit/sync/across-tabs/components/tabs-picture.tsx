import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * Two tabs of one app over one shared store. Tab 1 leads: it alone reads
 * the Backend. Tab 2 adds a task; it shows there at once, marked as
 * saving, until the Backend confirms it. The confirmed task goes into the
 * shared store, the Doorbell rings, and Tab 1 shows it too. Then the
 * network goes: both tabs keep the board. Tab 1 renames a task; the
 * Backend can't be reached, so the rename is undone. The network comes
 * back, and reading resumes.
 */

type Row = { readonly title: string; readonly saving?: boolean };

type Step = {
  readonly one: ReadonlyArray<Row>;
  readonly two: ReadonlyArray<Row>;
  readonly stored: number;
  readonly offline?: boolean;
  readonly bell?: boolean;
  readonly line: string;
};

const BASE: ReadonlyArray<Row> = [
  { title: 'Plan the week' },
  { title: 'Water the plants' },
];
const ADDED: ReadonlyArray<Row> = [...BASE, { title: 'Call home' }];

const STEPS: ReadonlyArray<Step> = [
  {
    one: BASE,
    two: BASE,
    stored: 2,
    line: 'one tab reads the Backend for all',
  },
  {
    one: BASE,
    two: [...BASE, { title: 'Call home', saving: true }],
    stored: 2,
    line: 'Tab 2 adds a task: it shows at once',
  },
  {
    one: BASE,
    two: ADDED,
    stored: 3,
    bell: true,
    line: 'confirmed and stored; the Doorbell rings',
  },
  {
    one: ADDED,
    two: ADDED,
    stored: 3,
    line: 'Tab 1 reads the store again: same board',
  },
  {
    one: ADDED,
    two: ADDED,
    stored: 3,
    offline: true,
    line: 'offline: the board stays',
  },
  {
    one: [...BASE, { title: 'Call mum', saving: true }],
    two: ADDED,
    stored: 3,
    offline: true,
    line: 'Tab 1 renames a task…',
  },
  {
    one: ADDED,
    two: ADDED,
    stored: 3,
    offline: true,
    line: '…the Backend can’t be reached, so it is undone',
  },
  { one: ADDED, two: ADDED, stored: 3, line: 'back online: reading resumes' },
];
const DURATIONS = [1500, 1500, 1700, 1700, 1500, 1400, 2000, 1600];

function Tab({
  name,
  leads,
  rows,
}: {
  readonly name: string;
  readonly leads: boolean;
  readonly rows: ReadonlyArray<Row>;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1">
        <span className="text-[11px] font-medium">{name}</span>
        {leads && (
          <span className="ml-auto rounded-full border border-border px-1.5 font-mono text-[9.5px] text-muted-foreground">
            leads
          </span>
        )}
      </div>
      <ul className="min-h-[4.75rem] space-y-1 p-2">
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((row, index) => (
            <motion.li
              key={`${index}-${row.title}`}
              layout="position"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
              className={`truncate rounded border px-1.5 text-[10.5px] leading-[18px] ${row.saving ? 'border-dashed border-foreground/40 text-muted-foreground' : 'border-border'}`}
            >
              {row.title}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

export function TabsPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="px-3 py-8 sm:px-8">
      <div className="mx-auto max-w-md">
        <div className="mb-3 flex items-center justify-center gap-2 text-[11px]">
          <span className="font-medium">Backend</span>
          <span
            className={`rounded-full border px-1.5 font-mono text-[10px] transition-colors duration-300 ${now.offline ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-border text-muted-foreground'}`}
          >
            {now.offline ? 'offline' : 'online'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Tab name="Tab 1" leads rows={now.one} />
          <Tab name="Tab 2" leads={false} rows={now.two} />
        </div>
        <div className="mx-auto h-4 w-px bg-border" />
        <div className="relative flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-[11px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="font-medium">Sync Store</span>
          <span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            <AnimatePresence>
              {now.bell && (
                <motion.span
                  key={`bell-${round}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1, transition: ENTER }}
                  exit={{ opacity: 0, transition: EXIT }}
                  className="rounded bg-foreground px-1 text-background"
                >
                  Doorbell
                </motion.span>
              )}
            </AnimatePresence>
            IndexedDB · {now.stored} tasks
          </span>
          <Flash {...(now.bell ? { at: round * 10 + 2 } : {})} />
        </div>
      </div>
      <p className="mt-6 h-4 text-center font-mono text-[11px] text-muted-foreground">
        <AnimatePresence mode="wait">
          <motion.span
            key={`${round}-${step}`}
            className="inline-block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: ENTER }}
            exit={{ opacity: 0, transition: EXIT }}
          >
            {now.line}
          </motion.span>
        </AnimatePresence>
      </p>
    </div>
  );
}
