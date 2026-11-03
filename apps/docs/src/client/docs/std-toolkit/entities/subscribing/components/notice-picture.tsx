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
 * A subscriber on the work board, and writes arriving one at a time. A
 * write on work is saved, and the subscriber hears it: its count rolls
 * and it flashes. A write on another board is saved, but not for it. A
 * refused write is never saved, so nobody hears it.
 */

type Write = {
  readonly call: string;
  readonly outcome: 'heard' | 'other board' | 'refused';
};

const WRITES: ReadonlyArray<Write> = [
  { call: 'insert t1 · work', outcome: 'heard' },
  { call: 'insert t2 · home', outcome: 'other board' },
  { call: 'insert t1 · work, again', outcome: 'refused' },
  { call: 'delete t1 · work', outcome: 'heard' },
];

/** Each write takes two steps: it arrives, then what came of it shows. */
const DURATIONS = WRITES.flatMap(() => [900, 1500]);

export function NoticePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 7);
  const at = Math.floor(step / 2);
  const settled = step % 2 === 1;
  const write = WRITES[at]!;
  const heard = WRITES.slice(0, at + (settled ? 1 : 0)).filter(
    (one) => one.outcome === 'heard',
  ).length;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-8">
      <div className="w-full max-w-80">
        <div className="flex h-9 items-end justify-center">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={`${round}-${at}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{
                opacity: settled && write.outcome === 'refused' ? 0.5 : 1,
                y: 0,
                transition: ENTER,
              }}
              exit={{ opacity: 0, y: 14, transition: EXIT }}
            >
              <Message
                className={
                  settled && write.outcome === 'refused' ? 'line-through' : ''
                }
              >
                {write.call}
              </Message>
            </motion.span>
          </AnimatePresence>
        </div>
        <p className="mt-2 h-4 text-center font-mono text-[11px] text-muted-foreground">
          <AnimatePresence mode="wait">
            {settled && (
              <motion.span
                key={`${round}-${at}`}
                className="inline-block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                {write.outcome === 'heard'
                  ? 'saved, and heard'
                  : write.outcome === 'other board'
                    ? 'saved, on another board'
                    : 'refused: nothing to hear'}
              </motion.span>
            )}
          </AnimatePresence>
        </p>
        <div className="relative mt-3 flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="font-mono text-[11.5px]">
            subscribe({'{'} boardId: 'work' {'}'})
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            heard <Roll value={heard} className="text-foreground" />
          </span>
          <Flash at={heard === 0 ? 0 : round * 10 + heard} />
        </div>
      </div>
    </div>
  );
}
