import { motion } from '@kstackz/web-platform/components/motion';
import {
  GestureProvider,
  GestureZone,
  useSidebar,
} from '@kstackz/web-platform/input';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { createRoot } from 'react-dom/client';

const WIDTH = 280;

function Shell() {
  const sidebar = useSidebar({ side: 'left', width: WIDTH });
  return (
    <>
      <main className="h-dvh p-4 pl-8">
        <h1 className="text-xl font-semibold">Today</h1>
        <p className="text-sm text-muted-foreground">
          Swipe right from the left edge for places; swipe left to close.
        </p>
        <div className="mt-6 grid gap-3">
          {['Breakfast ₹220', 'Taxi ₹340', 'Books ₹899'].map((line) => (
            <p key={line} className="rounded-xl border p-4">
              {line}
            </p>
          ))}
        </div>
      </main>
      <motion.div
        aria-hidden="true"
        style={{ opacity: sidebar.progress }}
        className="pointer-events-none fixed inset-0 bg-black/40"
      />
      <motion.aside
        data-testid="sidebar"
        style={{ x: sidebar.x, width: WIDTH }}
        className="fixed inset-y-0 left-0 z-10 flex flex-col gap-1 bg-card p-4 shadow-xl"
      >
        <p className="mb-3 text-lg font-semibold">Places</p>
        {['Today', 'Accounts', 'Reports', 'Settings'].map((place) => (
          <p key={place} className="rounded-lg px-3 py-2 hover:bg-muted">
            {place}
          </p>
        ))}
      </motion.aside>
      <footer className="fixed inset-x-4 bottom-6 z-20 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          Sidebar
        </p>
        <p data-testid="open" className="text-2xl font-semibold">
          {sidebar.open ? 'Open' : 'Closed'}
        </p>
      </footer>
    </>
  );
}

export default Proof.browser({
  title: 'The sidebar follows a swipe open and a swipe shut',
  description:
    'The useSidebar Pattern: a swipe right from the left edge pulls it open under the finger, a swipe left anywhere closes it, and it settles by where the momentum would carry it.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <GestureZone className="h-dvh overflow-hidden bg-background text-foreground">
            <Shell />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The screen shows', '[data-testid=sidebar]');
      const open = yield* tab.text('[data-testid=open]');
      yield* Proof.assert('the sidebar is closed', open === 'Closed');
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      const edgeToMiddle = Array.from({ length: 37 }, (_, step) => {
        const t = step / 36;
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        return { x: 10 + 220 * eased, y: 420, t: t * 600 };
      });
      yield* tab.gesture(
        'Swipe right from the left edge',
        Gesture.fingers([edgeToMiddle]),
      );
      const afterOpen = {
        open: yield* tab.text('[data-testid=open]'),
        x: yield* tab.evaluate(
          () =>
            document
              .querySelector('[data-testid=sidebar]')!
              .getBoundingClientRect().x,
        ),
      };
      yield* tab.gesture(
        'Swipe left on the sidebar',
        Gesture.swipe('[data-testid=sidebar]', 'left', { distance: 180 }),
      );
      return {
        afterOpen,
        afterClose: yield* tab.text('[data-testid=open]'),
      };
    }),
  verify: ({ afterOpen, afterClose }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the swipe from the edge opened it all the way',
        afterOpen.open === 'Open' && Math.abs(afterOpen.x) < 1,
      );
      yield* Proof.assert('the swipe left closed it', afterClose === 'Closed');
    }),
});
