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
  useSwipe,
} from '@kstackz/web-platform/input';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

const PHOTOS = ['#f97316', '#14b8a6', '#6366f1'];
const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;

// The screen: a zone whose swipe right goes back.
function Screen(props: { readonly onBack: () => void }) {
  useSwipe({ direction: 'right', onCommit: props.onBack });
  return (
    <GestureZone>
      <Carousel />
    </GestureZone>
  );
}

// A zone inside it: swipes left, and right only past the first photo. On
// the first photo its swipe right is off, so the screen's takes it.
function Carousel() {
  const [at, setAt] = useState(0);
  // Where the strip is, in % of one photo's width.
  const x = useMotionValue(0);
  const percent = useTransform(x, (value) => `${value}%`);
  const settle = (to: number) => {
    setAt(to);
    void animate(x, -to * 100, SPRING);
  };
  const next = useSwipe({
    direction: 'left',
    enabled: at < PHOTOS.length - 1,
    onCommit: () => settle(at + 1),
    onCancel: () => settle(at),
  });
  const previous = useSwipe({
    direction: 'right',
    enabled: at > 0,
    onCommit: () => settle(at - 1),
    onCancel: () => settle(at),
  });
  const follow = () =>
    x.set(
      -at * 100 + ((previous.offset.get() - next.offset.get()) / 360) * 100,
    );
  useMotionValueEvent(next.offset, 'change', follow);
  useMotionValueEvent(previous.offset, 'change', follow);
  return (
    <div className="mt-6">
      <div data-testid="carousel" className="overflow-hidden rounded-2xl">
        <motion.div className="flex" style={{ x: percent }}>
          {PHOTOS.map((color, index) => (
            <div
              key={color}
              className="flex h-64 w-full shrink-0 items-end p-4 text-lg font-semibold text-white"
              style={{ background: color }}
            >
              Photo {index + 1}
            </div>
          ))}
        </motion.div>
      </div>
      <div className="mt-3 flex justify-center gap-2">
        {PHOTOS.map((color, index) => (
          <span
            key={color}
            className={`size-2 rounded-full ${index === at ? 'bg-foreground' : 'bg-muted-foreground/30'}`}
          />
        ))}
      </div>
      <p data-testid="photo" className="sr-only">
        Photo {at + 1}
      </p>
    </div>
  );
}

function App() {
  const [backs, setBacks] = useState(0);
  return (
    <GestureZone className="h-dvh bg-background p-4 text-foreground">
      <h1 className="text-xl font-semibold">Trip to Goa</h1>
      <p className="text-sm text-muted-foreground">
        Swipe the photos. On the first one, a swipe right goes back.
      </p>
      <Screen onBack={() => setBacks((count) => count + 1)} />
      <footer className="fixed inset-x-4 bottom-6 z-10 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          Screen
        </p>
        <p data-testid="back" className="text-2xl font-semibold">
          {backs === 0 ? 'Still here' : `Went back ${backs}×`}
        </p>
      </footer>
    </GestureZone>
  );
}

export default Proof.browser({
  title:
    'An inner zone takes the swipe it wants, and the outer zone gets the rest',
  description:
    'A carousel zone inside a screen zone: both want a swipe right, and the innermost one whose useSwipe is enabled takes it. On the first photo the carousel’s is off, so the screen goes back.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <App />
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The carousel shows', '[data-testid=carousel]');
      const start = {
        photo: yield* tab.text('[data-testid=photo]'),
        back: yield* tab.text('[data-testid=back]'),
      };
      yield* Proof.assert(
        'the first photo shows and nothing went back',
        start.photo === 'Photo 1' && start.back === 'Still here',
      );
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      const read = Effect.all({
        photo: tab.text('[data-testid=photo]'),
        back: tab.text('[data-testid=back]'),
      });
      yield* tab.gesture(
        'Swipe the photos left',
        Gesture.swipe('[data-testid=carousel]', 'left', { distance: 180 }),
      );
      const afterLeft = yield* read;
      yield* tab.gesture(
        'Swipe the photos right',
        Gesture.swipe('[data-testid=carousel]', 'right', { distance: 180 }),
      );
      const afterRight = yield* read;
      yield* tab.gesture(
        'Swipe right again on the first photo',
        Gesture.swipe('[data-testid=carousel]', 'right', { distance: 180 }),
      );
      const onFirst = yield* read;
      return { afterLeft, afterRight, onFirst };
    }),
  verify: ({ afterLeft, afterRight, onFirst }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'a swipe left moved to photo 2',
        afterLeft.photo === 'Photo 2' && afterLeft.back === 'Still here',
      );
      yield* Proof.assert(
        'a swipe right went back to photo 1, not off the screen',
        afterRight.photo === 'Photo 1' && afterRight.back === 'Still here',
      );
      yield* Proof.assert(
        'on the first photo, a swipe right went back a screen',
        onFirst.photo === 'Photo 1' && onFirst.back === 'Went back 1×',
      );
    }),
});
