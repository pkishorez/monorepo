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

const NAMES = Array.from({ length: 24 }, (_, index) => `Receipt ${index + 1}`);

function Inbox() {
  const [rows, setRows] = useState(NAMES);
  const [done, setDone] = useState('Nothing filed');
  return (
    <>
      <ul
        data-testid="list"
        className="h-full overflow-y-auto overscroll-contain px-4 pb-28"
      >
        {rows.map((name) => (
          <li key={name} className="py-1">
            <GestureZone className="overflow-hidden rounded-xl">
              <Row
                name={name}
                onFiled={() => {
                  setRows((all) => all.filter((each) => each !== name));
                  setDone(`Filed ${name}`);
                }}
              />
            </GestureZone>
          </li>
        ))}
      </ul>
      <footer className="fixed inset-x-4 bottom-6 z-10 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          {rows.length} receipts
        </p>
        <p data-testid="done" className="text-2xl font-semibold">
          {done}
        </p>
      </footer>
    </>
  );
}

// Each row wants only `right`: a touch that first moves up or down is not
// its own, so the list scrolls as if the row were not there.
function Row(props: { readonly name: string; readonly onFiled: () => void }) {
  const x = useMotionValue(0);
  const swipe = useSwipe({
    direction: 'right',
    onCommit: () =>
      void animate(x, 420, { duration: 0.18 }).then(props.onFiled),
    onCancel: () => void animate(x, 0, { type: 'spring', bounce: 0 }),
  });
  useMotionValueEvent(swipe.offset, 'change', (offset) => x.set(offset));
  return (
    <div className="relative bg-sky-500">
      <span className="absolute inset-y-0 left-4 flex items-center text-sm font-medium text-white">
        File
      </span>
      <motion.div
        data-testid={props.name}
        style={{ x }}
        className="relative border bg-card px-4 py-4 rounded-xl"
      >
        {props.name}
      </motion.div>
    </div>
  );
}

export default Proof.browser({
  title: 'Rows swipe sideways while the list still scrolls',
  description:
    'Each row is a Gesture Zone with a useSwipe right inside a scrolling list: a swipe up on a row scrolls the list, a swipe right on a row files it.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <main className="flex h-dvh flex-col bg-background text-foreground">
            <header className="p-4 pb-2">
              <h1 className="text-xl font-semibold">Receipts</h1>
              <p className="text-sm text-muted-foreground">
                Scroll the list; swipe a receipt right to file it.
              </p>
            </header>
            <div className="min-h-0 flex-1">
              <Inbox />
            </div>
          </main>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The list shows', '[data-testid="Receipt 3"]');
      const top = yield* tab.evaluate(
        () => document.querySelector('[data-testid=list]')!.scrollTop,
      );
      yield* Proof.assert('the list is at its top', top === 0);
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.gesture(
        'Swipe up on Receipt 5',
        Gesture.swipe('[data-testid="Receipt 5"]', 'up', {
          distance: 260,
          duration: '500 millis',
        }),
      );
      // The fling coasts to a stop.
      yield* Effect.sleep('800 millis');
      const afterScroll = {
        scrolled: yield* tab.evaluate(
          () => document.querySelector('[data-testid=list]')!.scrollTop,
        ),
        done: yield* tab.text('[data-testid=done]'),
      };
      yield* tab.gesture(
        'Swipe Receipt 9 right',
        Gesture.swipe('[data-testid="Receipt 9"]', 'right', { distance: 200 }),
      );
      yield* tab.waitFor('Receipt 9 is filed', 'text=Filed Receipt 9');
      return {
        afterScroll,
        filed: yield* tab.text('[data-testid=done]'),
        stillListed: yield* tab.count('[data-testid="Receipt 9"]'),
      };
    }),
  verify: ({ afterScroll, filed, stillListed }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the swipe up scrolled the list (${Math.round(afterScroll.scrolled)}px)`,
        afterScroll.scrolled > 150,
      );
      yield* Proof.assert(
        'and filed nothing',
        afterScroll.done === 'Nothing filed',
      );
      yield* Proof.assert(
        'the swipe right filed Receipt 9',
        filed === 'Filed Receipt 9' && stillListed === 0,
      );
    }),
});
