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

const spread = (a: Pointer, b: Pointer) =>
  Math.hypot(a.x.get() - b.x.get(), a.y.get() - b.y.get());
const angle = (a: Pointer, b: Pointer) =>
  (Math.atan2(b.y.get() - a.y.get(), b.x.get() - a.x.get()) * 180) / Math.PI;

function Sticker() {
  const scale = useMotionValue(1);
  const rotate = useMotionValue(0);
  const zoom = useTransform(scale, (value) => `${value.toFixed(2)}×`);
  const turn = useTransform(rotate, (value) => `${Math.round(value)}°`);
  const stop = useRef<Array<() => void>>([]);

  // One pair of fingers moves the sticker two ways at once: the spread
  // scales it and the angle between them turns it.
  const follow = (fingers: ReadonlyArray<Pointer>) => {
    for (const off of stop.current) off();
    stop.current = [];
    const [a, b] = fingers;
    if (fingers.length !== 2 || a === undefined || b === undefined) return;
    const from = { spread: spread(a, b), scale: scale.get() };
    let last = angle(a, b);
    const update = () => {
      scale.set((from.scale * spread(a, b)) / from.spread);
      const now = angle(a, b);
      rotate.set(rotate.get() + (((now - last + 540) % 360) - 180));
      last = now;
    };
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
          data-testid="sticker"
          style={{ scale, rotate }}
          className="flex size-36 items-center justify-center rounded-3xl bg-amber-300 text-5xl font-black text-amber-900 shadow-xl"
        >
          Hi
        </motion.div>
      </div>
      <footer className="fixed inset-x-4 bottom-6 z-10 grid grid-cols-2 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <div>
          <p className="text-xs font-medium tracking-wide uppercase opacity-60">
            Zoom
          </p>
          <motion.p
            data-testid="zoom"
            className="text-3xl font-semibold tabular-nums"
          >
            {zoom}
          </motion.p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide uppercase opacity-60">
            Turn
          </p>
          <motion.p
            data-testid="turn"
            className="text-3xl font-semibold tabular-nums"
          >
            {turn}
          </motion.p>
        </div>
      </footer>
    </>
  );
}

export default Proof.browser({
  title: 'Two fingers zoom and turn a sticker in one move',
  description:
    'Each finger follows its own path: they spread apart and swing round together, and useGesture reads both the spread and the angle from the same two Pointers.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <GestureZone className="flex h-dvh flex-col bg-background p-6 text-foreground">
            <header>
              <h1 className="text-xl font-semibold">Place the sticker</h1>
              <p className="text-sm text-muted-foreground">
                Spread and twist two fingers.
              </p>
            </header>
            <Sticker />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The sticker shows', '[data-testid=sticker]');
      const center = yield* tab.evaluate(() => {
        const box = document
          .querySelector('[data-testid=sticker]')!
          .getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      });
      const start = {
        zoom: yield* tab.text('[data-testid=zoom]'),
        turn: yield* tab.text('[data-testid=turn]'),
      };
      yield* Proof.assert(
        'the sticker starts at 1× and 0°',
        start.zoom === '1.00×' && start.turn === '0°',
      );
      return { tab, center, start };
    }),
  act: ({ tab, center }) =>
    Effect.gen(function* () {
      // Two fingers opposite each other, from 40px out to 72px out (1.8×),
      // swinging 60° clockwise, over 1.2 s.
      const finger = (side: 0 | 1) =>
        Array.from({ length: 73 }, (_, step) => {
          const t = step / 72;
          const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
          const radius = 40 + 32 * eased;
          const turn = ((-30 + 60 * eased) * Math.PI) / 180 + side * Math.PI;
          return {
            x: center.x + Math.cos(turn) * radius,
            y: center.y + Math.sin(turn) * radius,
            t: 100 + t * 1200,
          };
        });
      const paths = [finger(0), finger(1)].map((path) => [
        { ...path[0]!, t: 0 },
        ...path,
        { ...path.at(-1)!, t: 1400 },
      ]);
      yield* tab.gesture('Spread and twist at once', Gesture.fingers(paths));
      return {
        zoom: yield* tab.text('[data-testid=zoom]'),
        turn: yield* tab.text('[data-testid=turn]'),
      };
    }),
  verify: ({ zoom, turn }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `it zoomed to about 1.8× (${zoom})`,
        Math.abs(Number.parseFloat(zoom) - 1.8) < 0.05,
      );
      yield* Proof.assert(
        `it turned about 60° (${turn})`,
        Math.abs(Number.parseInt(turn, 10) - 60) <= 2,
      );
    }),
});
