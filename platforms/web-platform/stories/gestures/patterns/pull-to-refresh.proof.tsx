import { motion, useTransform } from '@kstackz/web-platform/components/motion';
import {
  GestureProvider,
  GestureZone,
  usePullToRefresh,
} from '@kstackz/web-platform/input';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

const LABEL = {
  idle: 'Pull to refresh',
  pulling: 'Keep pulling',
  armed: 'Let go to refresh',
  refreshing: 'Refreshing…',
} as const;

function Feed() {
  const [items, setItems] = useState(['Rent paid', 'Salary in', 'Lunch']);
  const [refreshes, setRefreshes] = useState(0);
  const pull = usePullToRefresh({
    // A slow network: the indicator holds until this settles.
    onRefresh: () =>
      new Promise<void>((done) =>
        setTimeout(() => {
          setItems((all) => [`New payment ${all.length - 2}`, ...all]);
          setRefreshes((count) => count + 1);
          done();
        }, 2500),
      ),
  });
  const spin = useTransform(pull.progress, [0, 1], [0, 270]);
  return (
    <>
      <motion.div
        style={{ height: pull.y }}
        className="flex items-end justify-center overflow-hidden"
      >
        <div className="flex items-center gap-2 pb-3 text-sm text-muted-foreground">
          <motion.span
            style={{ rotate: spin }}
            className={`size-5 rounded-full border-2 border-foreground/70 border-t-transparent ${pull.state === 'refreshing' ? 'animate-spin' : ''}`}
          />
          <span data-testid="pull-state">{LABEL[pull.state]}</span>
        </div>
      </motion.div>
      <ul
        data-testid="feed"
        className="flex-1 overflow-y-auto overscroll-contain"
      >
        {items.map((item) => (
          <li key={item} className="border-b px-4 py-4">
            {item}
          </li>
        ))}
      </ul>
      <footer className="fixed inset-x-4 bottom-6 z-10 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          {LABEL[pull.state]}
        </p>
        <p data-testid="refreshes" className="text-2xl font-semibold">
          Refreshed {refreshes}×
        </p>
      </footer>
    </>
  );
}

export default Proof.browser({
  title: 'Pulling the list down refreshes it',
  description:
    'The usePullToRefresh Pattern: a swipe down at the top of the list pulls the indicator with resistance, arms past 72px, and holds while onRefresh runs.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <GestureZone className="flex h-dvh flex-col bg-background text-foreground">
            <h1 className="p-4 pb-2 text-xl font-semibold">Activity</h1>
            <Feed />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The feed shows', '[data-testid=feed]');
      const items = yield* tab.count('[data-testid=feed] li');
      yield* Proof.assert('three items show', items === 3);
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.gesture(
        'Pull the list down',
        Gesture.swipe('[data-testid=feed]', 'down', {
          distance: 220,
          duration: '700 millis',
        }),
      );
      const during = yield* tab.text('[data-testid=pull-state]');
      yield* tab.waitFor('The refresh lands', 'text=Refreshed 1×');
      return {
        during,
        first: yield* tab.text('[data-testid=feed] li >> nth=0'),
        items: yield* tab.count('[data-testid=feed] li'),
      };
    }),
  verify: ({ during, first, items }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the indicator held while refreshing (${during})`,
        during === 'Refreshing…',
      );
      yield* Proof.assert(
        'the new item is on top',
        first === 'New payment 1' && items === 4,
      );
    }),
});
