import { useSidebar } from '@kstackz/use-gesture';
import { type SwipeRelease, useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import { useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const WIDTH = 200;
const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;

const TABS = ['For you', 'Following', 'Popular'].map((title) => ({
  title,
  items: Array.from({ length: 30 }, (_, i) => `${title} · ${i + 1}`),
}));

/**
 * Tabs whose pages each scroll up and down, beside a sidebar. A page keeps a
 * touch that moves up or down; one that moves sideways goes to the tabs, or
 * to the sidebar on the first tab.
 */
export function TabsWithScroll() {
  const [tab, setTab] = useState(0);
  const sidebar = useSidebar({
    side: 'left',
    width: WIDTH,
    enabled: tab === 0,
  });
  const box = useRef<HTMLDivElement>(null);
  // The tab shown, fractional while fingers move it.
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
  // `sign`: 1 for the Swipe left to the next tab, -1 for the one back.
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
    enabled: tab < TABS.length - 1 && !sidebar.open,
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

  const [scrolling, setScrolling] = useState(false);
  useStageStatus(
    scrolling
      ? 'The page has the touch'
      : sidebar.dragging
        ? 'The sidebar has the touch'
        : next.state === 'tracking' || previous.state === 'tracking'
          ? 'The tabs have the touch'
          : sidebar.open
            ? 'Sidebar open'
            : undefined,
  );

  return (
    <>
      <div ref={box} className="absolute inset-0 flex flex-col">
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
              <div
                key={t.title}
                className="h-full w-full shrink-0 overflow-y-auto"
                onScroll={() => setScrolling(true)}
                onScrollEnd={() => setScrolling(false)}
              >
                <ul className="divide-y divide-border">
                  {t.items.map((item) => (
                    <li key={item} className="px-4 py-3 text-sm">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </motion.div>
        </div>
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
        <span className="font-medium">Sidebar</span>
      </motion.aside>
    </>
  );
}
