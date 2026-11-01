import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Message,
  Roll,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * A move, as the tree sees it. The Router sits above the shop and holds
 * the Route. A click on a link is one Message to it: the Route changes,
 * then the old product page leaves, then the new one arrives. Back is one
 * Message too, and undoes it the same way, one thing at a time.
 */

type Step = {
  readonly id: 1 | 2;
  readonly product: 1 | 2 | null;
  readonly message?: { readonly name: string; readonly from: string };
};

const PUSHED = { name: 'Pushed', from: 'a click on the Chair' };
const WENT = { name: 'Went { by: -1 }', from: 'Back' };

const STEPS: ReadonlyArray<Step> = [
  { id: 1, product: 1 },
  { id: 1, product: 1, message: PUSHED },
  { id: 2, product: 1 },
  { id: 2, product: null },
  { id: 2, product: 2 },
  { id: 2, product: 2, message: WENT },
  { id: 1, product: 2 },
  { id: 1, product: null },
  { id: 1, product: 1 },
];
const DURATIONS = [1300, 1000, 1100, 500, 1500, 1000, 1100, 500, 1500];
const NAMES = { 1: 'Lamp', 2: 'Chair' } as const;

export function MovePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 4);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-8">
      <div className="w-full max-w-72">
        <div className="flex h-14 flex-col items-center justify-end">
          <AnimatePresence mode="popLayout">
            {now.message && (
              <motion.span
                key={`${round}-${step}`}
                className="flex flex-col items-center gap-1"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, y: 14, transition: EXIT }}
              >
                <span className="text-[11px] text-muted-foreground">
                  {now.message.from}
                </span>
                <Message>{now.message.name}</Message>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-4 h-52">
          <Node
            name="Router"
            fact={
              <span className="flex">
                /products/
                <Roll value={now.id} />
              </span>
            }
            flash={step === 2 || step === 6 ? round * 10 + step : undefined}
          >
            <Node name="App">
              <Node name="Products">
                <AnimatePresence initial={false}>
                  {now.product && (
                    <Branch key={now.product}>
                      <Node
                        name="Product"
                        fact={`${NAMES[now.product]} · id ${now.product}`}
                      />
                    </Branch>
                  )}
                </AnimatePresence>
              </Node>
            </Node>
          </Node>
        </div>
      </div>
    </div>
  );
}

/** An Actor in the tree: a box, with its Children hanging under it. */
function Node({
  name,
  fact,
  flash,
  children,
}: {
  readonly name: string;
  readonly fact?: ReactNode;
  readonly flash?: number | undefined;
  readonly children?: ReactNode;
}) {
  return (
    <div>
      <div className="relative flex h-9 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <span className="font-medium">{name}</span>
        {fact && (
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {fact}
          </span>
        )}
        <Flash at={flash} />
      </div>
      {children && (
        <div className="ml-4 border-l border-border pl-3">{children}</div>
      )}
    </div>
  );
}

/** A page arriving under its parent, and leaving. */
function Branch({ children }: { readonly children: ReactNode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto', transition: ENTER }}
      exit={{ opacity: 0, height: 0, transition: EXIT }}
      className="overflow-hidden pt-2"
    >
      {children}
    </motion.div>
  );
}
