import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from '@kstackz/web-platform/components/motion';
import {
  GestureProvider,
  GestureZone,
  type SwipeRelease,
  useSwipe,
} from '@kstackz/web-platform/input';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

const TABS = ['Day', 'Week', 'Month'] as const;
const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;
// A short drag or a light flick turns the tab.
const COMMIT = { distance: 60, velocity: 300 };

// Two Swipes in one zone, one each way, kept apart by `enabled`: there is
// no swipe left from the last tab, nor right from the first.
function Pages() {
  const [at, setAt] = useState(0);
  const page = useMotionValue(0);
  const x = useTransform(page, (p) => `${-p * 100}%`);
  const track = useRef<HTMLDivElement>(null);
  const width = () => track.current?.offsetWidth || 1;

  const go = (to: number, release?: SwipeRelease) => {
    const next = Math.min(Math.max(to, 0), TABS.length - 1);
    const velocity = release === undefined ? 0 : release.velocity / width();
    void animate(page, next, { ...SPRING, velocity });
    setAt(next);
  };

  const left = useSwipe({
    direction: 'left',
    enabled: at < TABS.length - 1,
    commit: COMMIT,
    onCommit: (release) => go(at + 1, release),
    onCancel: () => go(at),
  });
  const right = useSwipe({
    direction: 'right',
    enabled: at > 0,
    commit: COMMIT,
    onCommit: (release) => go(at - 1, release),
    onCancel: () => go(at),
  });
  const follow = () =>
    page.set(at + (left.offset.get() - right.offset.get()) / width());
  useMotionValueEvent(left.offset, 'change', follow);
  useMotionValueEvent(right.offset, 'change', follow);

  return (
    <>
      <nav className="mt-4 flex gap-1 rounded-full bg-muted p-1">
        {TABS.map((tab, index) => (
          <span
            key={tab}
            className={`flex-1 rounded-full py-1.5 text-center text-sm font-medium transition-colors ${index === at ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          >
            {tab}
          </span>
        ))}
      </nav>
      <div ref={track} data-testid="pages" className="mt-4 overflow-hidden">
        <motion.div className="flex" style={{ x }}>
          {TABS.map((tab, index) => (
            <section
              key={tab}
              className="flex h-72 w-full shrink-0 flex-col justify-end rounded-2xl p-5 text-white"
              style={{
                background: ['#0ea5e9', '#8b5cf6', '#f43f5e'][index],
              }}
            >
              <p className="text-sm opacity-80">Spent this {tab}</p>
              <p className="text-4xl font-semibold">
                {['₹640', '₹4,120', '₹17,900'][index]}
              </p>
            </section>
          ))}
        </motion.div>
      </div>
      <footer className="fixed inset-x-4 bottom-6 z-10 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          Tab
        </p>
        <p data-testid="tab" className="text-2xl font-semibold">
          {TABS[at]}
        </p>
      </footer>
    </>
  );
}

export default Proof.browser({
  title: 'Swiping left and right turns the tabs',
  description:
    'Two useSwipes in one Gesture Zone, one per Direction, each enabled only where there is a tab to go to; the pages follow the fingers and settle with their speed.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <GestureZone className="h-dvh bg-background p-4 text-foreground">
            <h1 className="text-xl font-semibold">Spending</h1>
            <Pages />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The pages show', '[data-testid=pages]');
      const first = yield* tab.text('[data-testid=tab]');
      yield* Proof.assert('Day is open', first === 'Day');
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      const seen: string[] = [];
      yield* tab.gesture(
        'Swipe left',
        Gesture.swipe('[data-testid=pages]', 'left', { distance: 160 }),
      );
      seen.push(yield* tab.text('[data-testid=tab]'));
      yield* tab.gesture(
        'Swipe left again',
        Gesture.swipe('[data-testid=pages]', 'left', { distance: 160 }),
      );
      seen.push(yield* tab.text('[data-testid=tab]'));
      yield* tab.gesture(
        'Swipe left at the last tab',
        Gesture.swipe('[data-testid=pages]', 'left', { distance: 160 }),
      );
      seen.push(yield* tab.text('[data-testid=tab]'));
      yield* tab.gesture(
        'Swipe right',
        Gesture.swipe('[data-testid=pages]', 'right', { distance: 160 }),
      );
      seen.push(yield* tab.text('[data-testid=tab]'));
      return seen;
    }),
  verify: (seen) =>
    Proof.assert(
      `the tabs went Week, Month, stayed on Month, then back to Week (${seen.join(', ')})`,
      seen.join(',') === 'Week,Month,Month,Week',
    ),
});
