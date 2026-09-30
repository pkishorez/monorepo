import { ArchiveIcon, Trash2Icon } from '@kstackz/ui-toolkit/lucide';
import { GestureZone } from '@kstackz/use-gesture';
import { useGesture } from '@kstackz/use-gesture/core';
import { type SwipeRelease, useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const ACTIONS = 144;
const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;

const MAIL = [
  { from: 'Maya Chen', subject: 'Design review moved to Thursday' },
  { from: 'Stripe', subject: 'Your payout is on its way' },
  { from: 'Leo Park', subject: 'Re: the onboarding copy' },
  { from: 'GitHub', subject: '3 new comments on #482' },
  { from: 'Ana Ruiz', subject: 'Photos from Saturday' },
];

/**
 * A list where only one row is open at a time: a finger landing on any
 * other row shuts the open one before that row moves.
 */
export function OneAtATime() {
  const [open, setOpen] = useState<string>();
  useStageStatus(open === undefined ? undefined : `Open: ${open}`);

  return (
    <div className="absolute inset-0 divide-y divide-border">
      {MAIL.map((mail) => (
        <GestureZone key={mail.from} className="relative h-14 overflow-hidden">
          <Row
            {...mail}
            open={open === mail.from}
            onTouch={() =>
              setOpen((current) =>
                current === mail.from ? current : undefined,
              )
            }
            onOpenChange={(next) =>
              setOpen((current) =>
                next ? mail.from : current === mail.from ? undefined : current,
              )
            }
          />
        </GestureZone>
      ))}
    </div>
  );
}

/**
 * One row, inside its own Gesture Zone. It says when a finger lands on it,
 * follows a Swipe left while shut and a Swipe right while open, and follows
 * `open` when the list shuts it.
 */
function Row(props: {
  readonly from: string;
  readonly subject: string;
  readonly open: boolean;
  readonly onTouch: () => void;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const x = useMotionValue(0);
  const grabbed = useRef<number | undefined>(undefined);
  // Where it is headed, so `open` catching up does not restart the spring.
  const target = useRef(props.open);

  const to = (open: boolean, velocity = 0) => {
    target.current = open;
    animate(x, open ? -ACTIONS : 0, { ...SPRING, velocity });
  };
  const settle = (open: boolean, velocity = 0) => {
    grabbed.current = undefined;
    to(open, velocity);
    props.onOpenChange(open);
  };
  useEffect(() => {
    if (target.current !== props.open) to(props.open);
  });

  const grab = () => {
    x.stop();
    grabbed.current = x.get();
  };
  const release = (sign: 1 | -1) => (at?: SwipeRelease) => {
    if (grabbed.current === undefined) return;
    if (at === undefined) return settle(props.open);
    const headed = grabbed.current + sign * at.projected;
    settle(headed < -ACTIONS / 2, sign * at.velocity);
  };
  const follow = (at: number) => x.set(Math.min(0, Math.max(-ACTIONS, at)));

  useGesture({ onStart: props.onTouch });
  const opening = useSwipe({
    enabled: !props.open,
    direction: 'left',
    onStart: grab,
    onCommit: release(-1),
    onCancel: (_reason, at) => release(-1)(at),
  });
  const closing = useSwipe({
    enabled: props.open,
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
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: ACTIONS }}
      >
        <button
          type="button"
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-primary text-xs text-primary-foreground"
          onClick={() => settle(false)}
        >
          <ArchiveIcon className="size-4" aria-hidden="true" />
          Archive
        </button>
        <button
          type="button"
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-destructive text-xs text-white"
          onClick={() => settle(false)}
        >
          <Trash2Icon className="size-4" aria-hidden="true" />
          Delete
        </button>
      </div>
      <motion.div
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
