import { ArchiveIcon, Trash2Icon } from '@kstackz/ui-toolkit/lucide';
import { GestureZone, useSidebar } from '@kstackz/use-gesture';
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

const WIDTH = 200;
const ACTIONS = 144;
const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;

const PEOPLE = [
  'Maya Chen',
  'Leo Park',
  'Ana Ruiz',
  'Sam Okafor',
  'Iris Novak',
];
const SUBJECTS = [
  'Design review moved to Thursday',
  'Re: the onboarding copy',
  'Photos from Saturday',
  'Invoice #2291',
  'Quick question about the API',
];
const MAIL = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  from: PEOPLE[i % PEOPLE.length]!,
  subject: SUBJECTS[(i * 3) % SUBJECTS.length]!,
}));

/**
 * A long list of rows that open from a Swipe left, a sidebar that opens from
 * a Swipe right, and scrolling up and down, all on one card. The scrolling
 * list is the rows' zone: a zone per row would take every touch that lands
 * on it, scrolling included. Each row acts only on a touch that lands on it,
 * and the sidebar waits while a row is open.
 */
export function RowsScrollSidebar() {
  const [open, setOpen] = useState<number>();
  const sidebar = useSidebar({
    side: 'left',
    width: WIDTH,
    enabled: open === undefined,
  });
  const [scrolling, setScrolling] = useState(false);
  useStageStatus(
    sidebar.dragging
      ? 'The sidebar has the touch'
      : scrolling
        ? 'The list has the touch'
        : sidebar.open
          ? 'Sidebar open'
          : open !== undefined
            ? 'Row open · sidebar waits'
            : undefined,
  );

  return (
    <>
      <GestureZone
        className="absolute inset-0 overflow-y-auto"
        onScroll={() => setScrolling(true)}
        onScrollEnd={() => setScrolling(false)}
      >
        <div className="divide-y divide-border">
          {MAIL.map((mail) => (
            <Row
              key={mail.id}
              {...mail}
              open={open === mail.id}
              onOpenChange={(next) =>
                setOpen((current) =>
                  next ? mail.id : current === mail.id ? undefined : current,
                )
              }
            />
          ))}
        </div>
      </GestureZone>
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
 * One row. It hears every Gesture in the list, and moves only for one whose
 * first finger landed on it; a finger landing anywhere else shuts it.
 */
function Row(props: {
  readonly from: string;
  readonly subject: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const mine = useRef(false);
  const grabbed = useRef<number | undefined>(undefined);
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
    if (!mine.current) return;
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

  useGesture({
    onStart: (pointers) => {
      const [first] = pointers.values();
      mine.current = ref.current?.contains(first?.target ?? null) ?? false;
      if (props.open && !mine.current) settle(false);
    },
  });
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
    <div ref={ref} className="relative h-14 overflow-hidden">
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
    </div>
  );
}
