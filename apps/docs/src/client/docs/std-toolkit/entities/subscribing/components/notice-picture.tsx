import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Message,
  Roll,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * A subscriber on the work board, and writes arriving one a step, each in
 * a slot of its own height above it. A write on work is saved, and the
 * subscriber hears it: its count rolls and it lights. A write on another
 * board is saved, but not for it. A refused write is struck through and
 * never saved, so nobody hears it.
 */

type Write = {
  readonly call: string;
  readonly outcome: 'heard' | 'other board' | 'refused';
  readonly caption: string;
};

const WRITES: ReadonlyArray<Write> = [
  {
    call: 'insert t1 · work',
    outcome: 'heard',
    caption:
      'A task is saved on the work board. The subscriber hears it as a Change Notice.',
  },
  {
    call: 'insert t2 · home',
    outcome: 'other board',
    caption:
      'A task is saved on home. It is not on work, so this subscriber hears nothing.',
  },
  {
    call: 'insert t1 · work, again',
    outcome: 'refused',
    caption:
      'Inserting t1 again is refused. Nothing was saved, so there is nothing to hear.',
  },
  {
    call: 'delete t1 · work',
    outcome: 'heard',
    caption:
      'A delete on work is saved too, and heard as a notice with _d set to true.',
  },
];
const CAPTIONS = WRITES.map((each) => each.caption);

export function NoticePicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const write = WRITES[step]!;
  const refused = write.outcome === 'refused';
  const heard = WRITES.slice(0, step + 1).filter(
    (one) => one.outcome === 'heard',
  ).length;
  return (
    <Walkthrough walk={walk}>
      <div className="grid place-items-center px-4 py-8">
        <div className="w-full max-w-80">
          <div className="grid h-9 place-items-end justify-center">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                <Message
                  className={
                    refused
                      ? 'border-red-500 text-red-600 line-through dark:text-red-400'
                      : ''
                  }
                >
                  {write.call}
                </Message>
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="mx-auto h-5 w-px bg-border" />
          <div className="relative flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <span className="font-mono text-[11.5px] whitespace-nowrap">
              subscribe({'{'} boardId: 'work' {'}'})
            </span>
            <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
              heard <Roll value={heard} className="text-foreground" />
            </span>
            <Flash
              {...(write.outcome === 'heard'
                ? { at: round * 10 + step + 1 }
                : {})}
            />
          </div>
        </div>
      </div>
    </Walkthrough>
  );
}
