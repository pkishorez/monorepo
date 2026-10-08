import { motion } from '@kstackz/web-platform/components/motion';
import {
  GestureProvider,
  GestureZone,
  useGesture,
  useSidebar,
} from '@kstackz/web-platform/input';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

type Point = { readonly x: number; readonly y: number };

// A pad that draws one line per stroke, wherever the finger goes.
function Strokes(props: { readonly name: string }) {
  const [strokes, setStrokes] = useState<ReadonlyArray<ReadonlyArray<Point>>>(
    [],
  );
  const pad = useRef<HTMLDivElement>(null);
  const stop = useRef<Array<() => void>>([]);
  useGesture({
    directions: 'all',
    onStart: (pointers) => {
      const [finger] = pointers.values();
      const box = pad.current?.getBoundingClientRect();
      if (finger === undefined || box === undefined) return;
      const at = () => ({
        x: finger.x.get() - box.x,
        y: finger.y.get() - box.y,
      });
      setStrokes((all) => [...all, [at()]]);
      const add = () =>
        setStrokes((all) => [
          ...all.slice(0, -1),
          [...(all.at(-1) ?? []), at()],
        ]);
      stop.current = [finger.x.on('change', add), finger.y.on('change', add)];
    },
    // Taken by another zone: the stroke was never this pad's.
    onEnd: (_pointers, { interrupted }) => {
      for (const off of stop.current) off();
      if (interrupted) setStrokes((all) => all.slice(0, -1));
    },
  });
  return (
    <div ref={pad} className="relative h-full">
      <svg className="absolute inset-0 size-full">
        {strokes.map((stroke, index) => (
          <polyline
            key={index}
            points={stroke.map(({ x, y }) => `${x},${y}`).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <p className="absolute top-3 right-4 text-sm text-muted-foreground">
        {props.name}:{' '}
        <span data-testid={`${props.name}-strokes`}>{strokes.length}</span>{' '}
        strokes
      </p>
    </div>
  );
}

function Screen() {
  const sidebar = useSidebar({ side: 'left', width: 260 });
  return (
    <>
      <div className="flex h-full flex-col gap-3 p-4 pt-20">
        <GestureZone
          trapped
          data-testid="trapped-pad"
          className="flex-1 rounded-2xl border-2 border-sky-400 bg-sky-50 text-sky-700"
        >
          <Strokes name="trapped" />
        </GestureZone>
        <GestureZone
          data-testid="loose-pad"
          className="flex-1 rounded-2xl border-2 border-dashed bg-muted/40"
        >
          <Strokes name="loose" />
        </GestureZone>
      </div>
      <motion.div
        aria-hidden="true"
        style={{ opacity: sidebar.progress }}
        className="pointer-events-none fixed inset-0 bg-black/40"
      />
      <motion.aside
        style={{ x: sidebar.x, width: 260 }}
        className="fixed inset-y-0 left-0 z-10 bg-card p-4 shadow-xl"
      >
        <p className="text-lg font-semibold">Sketches</p>
      </motion.aside>
      <footer className="fixed inset-x-4 bottom-6 z-20 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          Sidebar
        </p>
        <p data-testid="sidebar" className="text-2xl font-semibold">
          {sidebar.open ? 'Open' : 'Closed'}
        </p>
      </footer>
    </>
  );
}

export default Proof.browser({
  title: 'A trapped drawing pad keeps strokes from the screen edge to itself',
  description:
    'The screen’s useSidebar owns one-finger touches that land in its 24px edge strip, even over a zone inside that wants them. A `trapped` zone hides its Gestures from the zones around it, so a stroke from the edge draws there; on the loose pad the same stroke opens the sidebar.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <GestureZone className="h-dvh overflow-hidden bg-background text-foreground">
            <header className="absolute top-0 p-4">
              <h1 className="text-xl font-semibold">Sketch</h1>
              <p className="text-sm text-muted-foreground">
                Both pads reach the left edge.
              </p>
            </header>
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
      yield* tab.waitFor('The pads show', '[data-testid=loose-pad]');
      const pads = yield* tab.evaluate(() =>
        ['trapped-pad', 'loose-pad'].map((id) => {
          const box = document
            .querySelector(`[data-testid=${id}]`)!
            .getBoundingClientRect();
          return box.y + box.height / 2;
        }),
      );
      // The pads span the screen from 16px in; the screen edge is the sidebar's.
      yield* Proof.assert(
        'the sidebar is closed',
        (yield* tab.text('[data-testid=sidebar]')) === 'Closed',
      );
      return { tab, pads };
    }),
  act: ({ tab, pads }) =>
    Effect.gen(function* () {
      const stroke = (y: number) =>
        Gesture.fingers([
          Array.from({ length: 46 }, (_, step) => {
            const t = step / 45;
            const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
            return {
              x: 20 + 260 * eased,
              y: y + Math.sin(eased * Math.PI * 2) * 40,
              t: t * 750,
            };
          }),
        ]);
      yield* tab.gesture(
        'Draw from the left edge on the trapped pad',
        stroke(pads[0]!),
      );
      const trapped = {
        strokes: yield* tab.text('[data-testid=trapped-strokes]'),
        sidebar: yield* tab.text('[data-testid=sidebar]'),
      };
      yield* tab.gesture(
        'Draw from the left edge on the loose pad',
        stroke(pads[1]!),
      );
      return {
        trapped,
        loose: {
          strokes: yield* tab.text('[data-testid=loose-strokes]'),
          sidebar: yield* tab.text('[data-testid=sidebar]'),
        },
      };
    }),
  verify: ({ trapped, loose }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'on the trapped pad the stroke drew and the sidebar stayed shut',
        trapped.strokes === '1' && trapped.sidebar === 'Closed',
      );
      yield* Proof.assert(
        'on the loose pad the sidebar took the stroke and opened',
        loose.sidebar === 'Open' && loose.strokes === '0',
      );
    }),
});
