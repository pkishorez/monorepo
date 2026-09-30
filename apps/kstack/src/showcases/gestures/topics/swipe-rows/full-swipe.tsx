import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { ArchiveIcon } from '@kstackz/ui-toolkit/lucide';
import { GestureZone } from '@kstackz/use-gesture';
import { useGesture } from '@kstackz/use-gesture/core';
import { type SwipeRelease, useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const ACTIONS = 88;
/** How far across the row, as a share of its width, a release archives it. */
const FULL = 0.6;
const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;

const MAIL = [
  { from: 'Maya Chen', subject: 'Design review moved to Thursday' },
  { from: 'Stripe', subject: 'Your payout is on its way' },
  { from: 'Leo Park', subject: 'Re: the onboarding copy' },
  { from: 'GitHub', subject: '3 new comments on #482' },
  { from: 'Ana Ruiz', subject: 'Photos from Saturday' },
];

/**
 * Rows that open to Archive from a short Swipe left, and archive outright
 * when released past 60% of their width: the row slides out and collapses.
 */
export function FullSwipe() {
  const [rows, setRows] = useState(MAIL);
  const [armed, setArmed] = useState<string>();
  useStageStatus(
    armed !== undefined
      ? `Let go to archive ${armed}`
      : rows.length < MAIL.length
        ? `Archived ${MAIL.length - rows.length}`
        : undefined,
  );

  return (
    <div className="absolute inset-0 flex flex-col">
      <AnimatePresence initial={false}>
        {rows.map((mail) => (
          <motion.div
            key={mail.from}
            className="shrink-0 overflow-hidden border-b border-border"
            exit={{ height: 0 }}
            transition={SPRING}
          >
            <GestureZone className="relative h-14 overflow-hidden">
              <Row
                {...mail}
                onArmedChange={(on) =>
                  setArmed((current) =>
                    on
                      ? mail.from
                      : current === mail.from
                        ? undefined
                        : current,
                  )
                }
                onArchive={() => {
                  setArmed(undefined);
                  setRows((rows) => rows.filter((row) => row !== mail));
                }}
              />
            </GestureZone>
          </motion.div>
        ))}
      </AnimatePresence>
      {rows.length < MAIL.length ? (
        <Button
          variant="ghost"
          size="sm"
          className="m-3 self-center"
          onClick={() => setRows(MAIL)}
        >
          Reset
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One row, inside its own Gesture Zone. A Swipe left moves it as far as the
 * finger goes; past 60% of its width the action fills the row, and letting
 * go there slides it out.
 */
function Row(props: {
  readonly from: string;
  readonly subject: string;
  readonly onArmedChange: (armed: boolean) => void;
  readonly onArchive: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const width = useMotionValue(Number.POSITIVE_INFINITY);
  const [open, setOpen] = useState(false);
  const grabbed = useRef<number | undefined>(undefined);
  // Whether this Gesture moved the row, so a mouse let go on Archive doesn't click it.
  const dragged = useRef(false);
  const armed = useTransform(() => x.get() < -FULL * width.get());
  useMotionValueEvent(armed, 'change', props.onArmedChange);
  const background = useTransform(() =>
    armed.get() ? 'var(--primary)' : 'var(--muted)',
  );
  const color = useTransform(() =>
    armed.get() ? 'var(--primary-foreground)' : 'var(--foreground)',
  );

  const archive = (velocity = 0) => {
    grabbed.current = undefined;
    const to = -(ref.current?.offsetWidth ?? 0);
    void animate(x, to, { ...SPRING, velocity }).then(props.onArchive);
  };
  const settle = (next: boolean, velocity = 0) => {
    grabbed.current = undefined;
    animate(x, next ? -ACTIONS : 0, { ...SPRING, velocity });
    setOpen(next);
  };
  const grab = () => {
    dragged.current = true;
    x.stop();
    width.set(ref.current?.offsetWidth ?? Number.POSITIVE_INFINITY);
    grabbed.current = x.get();
  };
  const release = (sign: 1 | -1) => (at?: SwipeRelease) => {
    if (grabbed.current === undefined) return;
    if (at === undefined) return settle(open);
    if (armed.get()) return archive(sign * at.velocity);
    const headed = grabbed.current + sign * at.projected;
    settle(headed < -ACTIONS / 2, sign * at.velocity);
  };
  const follow = (at: number) => x.set(Math.min(0, Math.max(-width.get(), at)));

  useGesture({
    onEnd: (_pointers, end) => {
      if (dragged.current) end.preventClick();
      dragged.current = false;
    },
  });
  const opening = useSwipe({
    direction: 'left',
    onStart: grab,
    onCommit: release(-1),
    onCancel: (_reason, at) => release(-1)(at),
  });
  const closing = useSwipe({
    enabled: open,
    direction: 'right',
    onStart: grab,
    onCommit: release(1),
    onCancel: (_reason, at) => release(1)(at),
  });
  useMotionValueEvent(opening.offset, 'change', (offset) => {
    if (grabbed.current !== undefined) follow(grabbed.current - offset);
  });
  useMotionValueEvent(closing.offset, 'change', (offset) => {
    if (grabbed.current !== undefined) follow(grabbed.current + offset);
  });

  return (
    <>
      <motion.button
        type="button"
        className="absolute inset-0 flex items-center justify-end text-xs"
        style={{ backgroundColor: background, color }}
        onClick={() => archive()}
      >
        <span className="flex w-22 flex-col items-center gap-1">
          <ArchiveIcon className="size-4" aria-hidden="true" />
          Archive
        </span>
      </motion.button>
      <motion.div
        ref={ref}
        className="absolute inset-0 flex flex-col justify-center bg-card px-4"
        style={{ x }}
      >
        <span className="truncate text-sm font-medium">{props.from}</span>
        <span className="truncate text-xs text-muted-foreground">
          {props.subject}
        </span>
      </motion.div>
    </>
  );
}
