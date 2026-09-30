import { GestureZone, useSidebar } from '@kstackz/use-gesture';
import { type SwipeRelease, useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const WIDTH = 280;
const EDGE = 24;
const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;

const TABS = [
  {
    title: 'For you',
    items: ['Morning briefing', 'Saved for later', 'Picked for you'],
  },
  {
    title: 'Following',
    items: ['Maya Chen posted', 'Leo Park replied', 'Ana Ruiz shared'],
  },
  {
    title: 'Popular',
    items: ['Trending in design', 'Top this week', 'Most discussed'],
  },
];

/**
 * A sidebar that opens only from the left edge of the screen, and tabs that
 * follow a Swipe from anywhere else. The tabs are their own zone inside the
 * sidebar's. The sidebar captures touches landing at the edge, so its zone
 * takes them and the tabs inside it drop them: a Swipe from the edge never
 * moves the tabs.
 */
export function EdgeSidebar() {
  const sidebar = useSidebar({ side: 'left', width: WIDTH, edge: EDGE });
  const [tabsDragging, setTabsDragging] = useState(false);
  useStageStatus(
    sidebar.dragging
      ? 'The sidebar has the touch'
      : tabsDragging
        ? 'The tabs have the touch'
        : sidebar.open
          ? 'Sidebar open'
          : undefined,
  );

  return (
    <>
      <GestureZone className="absolute inset-0 pt-[env(safe-area-inset-top)]">
        <Tabs onDraggingChange={setTabsDragging} />
      </GestureZone>
      <motion.div
        className="absolute inset-0 z-20 bg-black/40"
        style={{
          opacity: sidebar.progress,
          pointerEvents: sidebar.open ? 'auto' : 'none',
        }}
        onClick={() => sidebar.setOpen(false)}
      />
      <motion.aside
        className="absolute inset-y-0 left-0 z-30 flex flex-col gap-2 bg-sidebar p-4 pt-[max(1rem,env(safe-area-inset-top))] text-sm shadow-xl"
        style={{ width: WIDTH, x: sidebar.x }}
      >
        <span className="font-medium">Sidebar</span>
      </motion.aside>
    </>
  );
}

/** Tabs that follow a Swipe left or right, inside their own zone. */
function Tabs(props: {
  readonly onDraggingChange: (dragging: boolean) => void;
}) {
  const [tab, setTab] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const page = useMotionValue(0);
  const x = useTransform(page, (p) => `${-p * 100}%`);
  const bar = useTransform(page, (p) => `${p * 100}%`);
  const grabbed = useRef<number | undefined>(undefined);

  const go = (next: number, velocity = 0) => {
    grabbed.current = undefined;
    animate(page, next, { ...SPRING, velocity });
    setTab(next);
  };
  const grab = () => {
    page.stop();
    grabbed.current = page.get();
  };
  const width = () => box.current?.offsetWidth ?? 1;
  const release = (sign: 1 | -1) => (at?: SwipeRelease) => {
    if (grabbed.current === undefined) return;
    if (at === undefined) return go(tab);
    const headed = Math.round(
      grabbed.current + (sign * at.projected) / width(),
    );
    go(
      Math.min(Math.max(headed, tab - 1, 0), tab + 1, TABS.length - 1),
      (sign * at.velocity) / width(),
    );
  };
  const follow = (at: number) =>
    page.set(Math.min(Math.max(at, 0), TABS.length - 1));

  const next = useSwipe({
    enabled: tab < TABS.length - 1,
    direction: 'left',
    onStart: grab,
    onCommit: release(1),
    onCancel: (_reason, at) => release(1)(at),
  });
  const previous = useSwipe({
    enabled: tab > 0,
    direction: 'right',
    onStart: grab,
    onCommit: release(-1),
    onCancel: (_reason, at) => release(-1)(at),
  });
  useMotionValueEvent(next.offset, 'change', (offset) => {
    if (grabbed.current !== undefined)
      follow(grabbed.current + offset / width());
  });
  useMotionValueEvent(previous.offset, 'change', (offset) => {
    if (grabbed.current !== undefined)
      follow(grabbed.current - offset / width());
  });
  const dragging = next.state === 'tracking' || previous.state === 'tracking';
  const { onDraggingChange } = props;
  useEffect(() => onDraggingChange(dragging), [onDraggingChange, dragging]);

  return (
    <div ref={box} className="flex h-full flex-col">
      <div className="relative flex shrink-0 border-b border-border">
        {TABS.map((t, i) => (
          <button
            key={t.title}
            type="button"
            className={`h-11 flex-1 text-sm ${i === tab ? 'font-medium' : 'text-muted-foreground'}`}
            onClick={() => go(i)}
          >
            {t.title}
          </button>
        ))}
        <motion.div
          className="absolute bottom-0 left-0 h-0.5 bg-foreground"
          style={{ width: `${100 / TABS.length}%`, x: bar }}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <motion.div className="flex h-full" style={{ x }}>
          {TABS.map((t) => (
            <ul
              key={t.title}
              className="w-full shrink-0 divide-y divide-border"
            >
              {t.items.map((item) => (
                <li key={item} className="px-6 py-3 text-sm">
                  {item}
                </li>
              ))}
            </ul>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
