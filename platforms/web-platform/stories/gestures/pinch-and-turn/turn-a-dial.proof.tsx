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

// The angle of the line from one finger to the other, in degrees.
const angle = (a: Pointer, b: Pointer) =>
  (Math.atan2(b.y.get() - a.y.get(), b.x.get() - a.x.get()) * 180) / Math.PI;

function Dial() {
  const turn = useMotionValue(0);
  const label = useTransform(turn, (value) => `${Math.round(value)}°`);
  const stop = useRef<Array<() => void>>([]);

  const follow = (fingers: ReadonlyArray<Pointer>) => {
    for (const off of stop.current) off();
    stop.current = [];
    const [a, b] = fingers;
    if (fingers.length !== 2 || a === undefined || b === undefined) return;
    let last = angle(a, b);
    const update = () => {
      const now = angle(a, b);
      // Across ±180° the angle wraps; the turn keeps counting.
      const delta = ((now - last + 540) % 360) - 180;
      last = now;
      turn.set(turn.get() + delta);
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
          data-testid="dial"
          style={{ rotate: turn }}
          className="relative size-56 rounded-full border-8 border-muted bg-card shadow-xl"
        >
          <span className="absolute top-3 left-1/2 h-10 w-2 -translate-x-1/2 rounded-full bg-rose-500" />
        </motion.div>
      </div>
      <footer className="fixed inset-x-4 bottom-6 z-10 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          Turned
        </p>
        <motion.p
          data-testid="turn"
          className="text-3xl font-semibold tabular-nums"
        >
          {label}
        </motion.p>
      </footer>
    </>
  );
}

export default Proof.browser({
  title: 'Two fingers turn a dial',
  description:
    'useGesture follows both fingers; the dial turns by the angle between them, unwrapped so a turn past 180° keeps counting.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <GestureZone className="flex h-dvh flex-col bg-background p-6 text-foreground">
            <header>
              <h1 className="text-xl font-semibold">Turn the dial</h1>
              <p className="text-sm text-muted-foreground">
                Twist two fingers on it.
              </p>
            </header>
            <Dial />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The dial shows', '[data-testid=dial]');
      const turn = yield* tab.text('[data-testid=turn]');
      yield* Proof.assert('the dial starts at 0°', turn === '0°');
      return { tab, turn };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.gesture(
        'Twist two fingers a quarter turn',
        Gesture.rotate('[data-testid=dial]', 90, { duration: '1 second' }),
      );
      return yield* tab.text('[data-testid=turn]');
    }),
  verify: (turn) =>
    Proof.assert(
      `the dial turned a quarter (${turn})`,
      Math.abs(Number.parseInt(turn, 10) - 90) <= 3,
    ),
});
