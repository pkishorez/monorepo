import { ArchiveIcon, Trash2Icon } from '@kstackz/ui-toolkit/lucide';
import { GestureZone, useSidebar } from '@kstackz/use-gesture';
import { type SwipeRelease, useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from 'motion/react';
import { useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const ACTIONS = 144;
const WIDTH = 200;
const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;

const MAIL = [
  { from: 'Maya Chen', subject: 'Design review moved to Thursday' },
  { from: 'Stripe', subject: 'Your payout is on its way' },
  { from: 'Leo Park', subject: 'Re: the onboarding copy' },
  { from: 'GitHub', subject: '3 new comments on #482' },
  { from: 'Ana Ruiz', subject: 'Photos from Saturday' },
];

/**
 * Rows that open from a Swipe left, beside a sidebar that opens from a Swipe
 * right anywhere. A shut row wants only a Swipe left, so a Swipe right on it
 * passes out to the sidebar. An open row wants the Swipe right that closes
 * it, so its zone takes that one and the sidebar never moves.
 */
export function OpenRowAndSidebar() {
  const sidebar = useSidebar({ side: 'left', width: WIDTH });
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  useStageStatus(
    sidebar.dragging
      ? 'The sidebar has the touch'
      : sidebar.open
        ? 'Sidebar open'
        : open.size > 0
          ? `Open: ${[...open].join(', ')}`
          : undefined,
  );

  return (
    <>
      <div className="absolute inset-0 divide-y divide-border">
        {MAIL.map((mail) => (
          <GestureZone
            key={mail.from}
            className="relative h-14 overflow-hidden"
          >
            <Row
              {...mail}
              open={open.has(mail.from)}
              onOpenChange={(next) =>
                setOpen((prev) => {
                  const set = new Set(prev);
                  if (next) set.add(mail.from);
                  else set.delete(mail.from);
                  return set;
                })
              }
            />
          </GestureZone>
        ))}
      </div>
      <motion.div
        className="absolute inset-0 bg-black/40"
        style={{
          opacity: sidebar.progress,
          pointerEvents: sidebar.open ? 'auto' : 'none',
        }}
        onClick={() => sidebar.setOpen(false)}
      />
      <motion.aside
        className="absolute inset-y-0 left-0 flex flex-col gap-2 bg-sidebar p-4 text-sm shadow-xl"
        style={{ width: WIDTH, x: sidebar.x }}
      >
        <span className="font-medium">Mailboxes</span>
      </motion.aside>
    </>
  );
}

/**
 * One row, inside its own Gesture Zone. It follows a Swipe left while shut
 * and a Swipe right while open, then settles by where the momentum would
 * carry it.
 */
function Row(props: {
  readonly from: string;
  readonly subject: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const x = useMotionValue(0);
  // Where the row was when fingers took it; unset while they don't have it.
  const grabbed = useRef<number | undefined>(undefined);

  const settle = (open: boolean, velocity = 0) => {
    grabbed.current = undefined;
    animate(x, open ? -ACTIONS : 0, { ...SPRING, velocity });
    props.onOpenChange(open);
  };
  const grab = () => {
    x.stop();
    grabbed.current = x.get();
  };
  // `sign`: -1 for the Swipe left, 1 for the Swipe right.
  const release = (sign: 1 | -1) => (at?: SwipeRelease) => {
    if (grabbed.current === undefined) return;
    if (at === undefined) return settle(props.open);
    const headed = grabbed.current + sign * at.projected;
    settle(headed < -ACTIONS / 2, sign * at.velocity);
  };
  const follow = (at: number) => x.set(Math.min(0, Math.max(-ACTIONS, at)));

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
