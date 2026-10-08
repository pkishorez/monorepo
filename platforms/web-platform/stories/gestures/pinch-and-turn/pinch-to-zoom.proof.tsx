import {
  motion,
  useMotionValue,
  useTransform,
} from '@kstackz/web-platform/components/motion';
import {
  GestureProvider,
  GestureZone,
  type Pointer,
  useGesture,
} from '@kstackz/web-platform/input';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useRef } from 'react';
import { createRoot } from 'react-dom/client';

// How far apart two fingers are, now.
const spread = (a: Pointer, b: Pointer) =>
  Math.hypot(a.x.get() - b.x.get(), a.y.get() - b.y.get());

function Photo() {
  const scale = useMotionValue(1);
  const label = useTransform(scale, (value) => `${value.toFixed(2)}×`);
  const stop = useRef<Array<() => void>>([]);

  // Every time a finger lands or lifts, the pinch starts over from the two
  // fingers down and the scale the photo has now.
  const follow = (fingers: ReadonlyArray<Pointer>) => {
    for (const off of stop.current) off();
    stop.current = [];
    const [a, b] = fingers;
    if (fingers.length !== 2 || a === undefined || b === undefined) return;
    const from = spread(a, b);
    const at = scale.get();
    const update = () => scale.set(Math.min(4, (at * spread(a, b)) / from));
    stop.current = [a.x, a.y, b.x, b.y].map((value) =>
      value.on('change', update),
    );
  };

  useGesture({
    directions: 'all',
    onPointer: (_pointer, pointers) =>
      follow([...pointers.values()].filter((p) => p.end === undefined)),
    onEnd: () => follow([]),
  });

  return (
    <>
      <div className="flex flex-1 items-center justify-center">
        <motion.div
          data-testid="photo"
          style={{ scale }}
          className="size-36 rounded-3xl bg-[linear-gradient(135deg,#fb923c,#e11d48_55%,#7c3aed)] shadow-xl"
        />
      </div>
      <footer className="fixed inset-x-4 bottom-6 z-10 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          Zoom
        </p>
        <motion.p
          data-testid="scale"
          className="text-3xl font-semibold tabular-nums"
        >
          {label}
        </motion.p>
      </footer>
    </>
  );
}

export default Proof.browser({
  title: 'Two fingers pinch a photo to zoom it',
  description:
    'useGesture with `directions: "all"` reads both fingers as motion values; the photo scales by how far apart they are.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <GestureZone className="flex h-dvh flex-col bg-background p-6 text-foreground">
            <header>
              <h1 className="text-xl font-semibold">Pinch to zoom</h1>
              <p className="text-sm text-muted-foreground">
                Spread two fingers on the photo.
              </p>
            </header>
            <Photo />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The photo shows', '[data-testid=photo]');
      const scale = yield* tab.text('[data-testid=scale]');
      yield* Proof.assert('the photo starts at 1×', scale === '1.00×');
      return { tab, scale };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.gesture(
        'Spread two fingers over the photo',
        Gesture.pinch('[data-testid=photo]', 2, { duration: '900 millis' }),
      );
      return yield* tab.text('[data-testid=scale]');
    }),
  verify: (scale) =>
    Proof.assert(
      `the photo zoomed to about 2× (${scale})`,
      Number.parseFloat(scale) > 1.8 && Number.parseFloat(scale) < 2.2,
    ),
});
