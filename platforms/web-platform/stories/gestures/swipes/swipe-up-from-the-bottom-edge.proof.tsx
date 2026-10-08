import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from '@kstackz/web-platform/components/motion';
import {
  GestureProvider,
  GestureZone,
  useSwipe,
} from '@kstackz/web-platform/input';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

const SHEET = 320;
const SPRING = { type: 'spring', visualDuration: 0.25, bounce: 0 } as const;

function Screen() {
  const [open, setOpen] = useState(false);
  // How far the sheet is up, in px.
  const lift = useMotionValue(0);
  const y = useMotionValue(SHEET);
  useMotionValueEvent(lift, 'change', (value) =>
    y.set(SHEET - Math.min(value, SHEET)),
  );

  // Owns touches that land in the bottom 40px, even over the list, which
  // would otherwise scroll; a swipe up anywhere else is the list's.
  const swipe = useSwipe({
    direction: 'up',
    from: { edge: 'bottom', within: 40 },
    enabled: !open,
    onCancel: () => void animate(lift, 0, SPRING),
    onCommit: () => {
      setOpen(true);
      void animate(lift, SHEET, SPRING);
    },
  });
  useMotionValueEvent(swipe.offset, 'change', (offset) => lift.set(offset));

  return (
    <>
      <ul
        data-testid="list"
        className="h-dvh overflow-y-auto overscroll-contain px-4 pt-4 pb-24"
      >
        <li className="pb-3">
          <h1 className="text-xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Swipe up from the bottom edge to add one.
          </p>
        </li>
        {Array.from({ length: 30 }, (_, index) => (
          <li
            key={index}
            className="flex justify-between border-b py-3 text-sm"
          >
            <span>Payment {index + 1}</span>
            <span className="text-muted-foreground tabular-nums">
              ₹{(index + 3) * 70}
            </span>
          </li>
        ))}
      </ul>
      <div className="pointer-events-none fixed inset-x-0 bottom-2 flex justify-center">
        <span className="h-1.5 w-28 rounded-full bg-foreground/30" />
      </div>
      <motion.section
        data-testid="sheet"
        data-open={open}
        style={{ y, height: SHEET }}
        className="fixed inset-x-0 bottom-0 z-10 rounded-t-3xl border-t bg-card p-5 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
      >
        <p className="text-lg font-semibold">New payment</p>
        <div className="mt-4 rounded-xl border px-4 py-3 text-3xl font-semibold tabular-nums">
          ₹0
        </div>
        <p
          data-testid="sheet-state"
          className="mt-4 text-sm text-muted-foreground"
        >
          {open ? 'Sheet open' : 'Sheet closed'}
        </p>
      </motion.section>
    </>
  );
}

export default Proof.browser({
  title: 'A swipe up from the bottom edge opens a sheet over a scrolling list',
  description:
    'useSwipe with `from: { edge: "bottom", within: 40 }` captures touches landing at the edge even over a list that scrolls; a swipe up elsewhere still scrolls the list.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <GestureZone className="h-dvh overflow-hidden bg-background text-foreground">
            <Screen />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The list shows', '[data-testid=list]');
      const screen = yield* tab.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
      }));
      const sheet = yield* tab.text('[data-testid=sheet-state]');
      yield* Proof.assert('the sheet is closed', sheet === 'Sheet closed');
      return { tab, screen };
    }),
  act: ({ tab, screen }) =>
    Effect.gen(function* () {
      const up = (fromY: number, distance: number) =>
        Gesture.fingers([
          Array.from({ length: 31 }, (_, step) => {
            const t = step / 30;
            return {
              x: screen.width / 2,
              y: fromY - distance * (0.5 * t + 0.5 * t * t),
              t: t * 450,
            };
          }),
        ]);
      yield* tab.gesture(
        'Swipe up in the middle of the list',
        up(screen.height * 0.7, 260),
      );
      const scrolled = yield* tab.evaluate(
        () => document.querySelector('[data-testid=list]')!.scrollTop,
      );
      const afterMiddle = yield* tab.text('[data-testid=sheet-state]');
      yield* tab.gesture(
        'Swipe up from the bottom edge',
        up(screen.height - 12, 300),
      );
      return {
        scrolled,
        afterMiddle,
        afterEdge: yield* tab.text('[data-testid=sheet-state]'),
      };
    }),
  verify: ({ scrolled, afterMiddle, afterEdge }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `a swipe in the middle scrolled the list (${Math.round(scrolled)}px)`,
        scrolled > 100,
      );
      yield* Proof.assert(
        'and left the sheet closed',
        afterMiddle === 'Sheet closed',
      );
      yield* Proof.assert(
        'a swipe from the bottom edge opened the sheet',
        afterEdge === 'Sheet open',
      );
    }),
});
