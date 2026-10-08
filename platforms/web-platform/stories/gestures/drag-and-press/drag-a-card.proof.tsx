import {
  animate,
  motion,
  useMotionValue,
} from '@kstackz/web-platform/components/motion';
import {
  GestureProvider,
  GestureZone,
  useGesture,
} from '@kstackz/web-platform/input';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

type Column = 'To do' | 'Done';

// The column under a point, by what the page shows there.
const columnAt = (x: number, y: number): Column | undefined => {
  for (const element of document.elementsFromPoint(x, y)) {
    const column = element.getAttribute('data-column');
    if (column === 'To do' || column === 'Done') return column;
  }
  return undefined;
};

function Board() {
  const [column, setColumn] = useState<Column>('To do');
  const [moved, setMoved] = useState('Not moved yet');
  return (
    <>
      <div className="grid flex-1 grid-cols-2 gap-3 pt-6">
        {(['To do', 'Done'] as const).map((name) => (
          <section
            key={name}
            data-column={name}
            data-testid={name === 'Done' ? 'done' : 'todo'}
            className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-3"
          >
            <h2 className="text-sm font-semibold text-muted-foreground">
              {name}
            </h2>
            {column === name && (
              <Card
                onDrop={(to) => {
                  if (to !== undefined) setColumn(to);
                  setMoved(to === undefined ? 'Dropped nowhere' : `In ${to}`);
                }}
              />
            )}
          </section>
        ))}
      </div>
      <footer className="fixed inset-x-4 bottom-6 z-10 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          Card
        </p>
        <p data-testid="moved" className="text-2xl font-semibold">
          {moved}
        </p>
      </footer>
    </>
  );
}

// A card that is its own Gesture Zone, so a drag that starts on it is its
// own, and follows the finger in every Direction.
function Card(props: { readonly onDrop: (to: Column | undefined) => void }) {
  return (
    <GestureZone>
      <Dragged {...props} />
    </GestureZone>
  );
}

function Dragged(props: { readonly onDrop: (to: Column | undefined) => void }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const stop = useRef<Array<() => void>>([]);
  const { active } = useGesture({
    directions: 'all',
    onStart: (pointers) => {
      const [finger] = pointers.values();
      if (finger === undefined) return;
      stop.current = [
        finger.dx.on('change', (dx) => x.set(dx)),
        finger.dy.on('change', (dy) => y.set(dy)),
      ];
    },
    onEnd: (pointers, { interrupted, preventClick }) => {
      for (const off of stop.current) off();
      const [finger] = pointers.values();
      const to =
        interrupted || finger?.end === undefined
          ? undefined
          : columnAt(finger.end.x, finger.end.y);
      preventClick();
      void animate(x, 0, { type: 'spring', duration: 0.3, bounce: 0 });
      void animate(y, 0, { type: 'spring', duration: 0.3, bounce: 0 });
      props.onDrop(to);
    },
  });
  return (
    <motion.div
      data-testid="card"
      style={{ x, y }}
      animate={{ scale: active ? 1.06 : 1 }}
      className="relative z-10 rounded-xl border bg-card p-4 shadow-md"
    >
      <p className="font-medium">Pay rent</p>
      <p className="text-sm text-muted-foreground">Due Friday</p>
    </motion.div>
  );
}

export default Proof.browser({
  title: 'One finger drags a card to another column',
  description:
    'A card is its own Gesture Zone; useGesture with `directions: "all"` takes the touch, the card follows the finger’s dx and dy, and where the finger lifts picks the column.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <main className="flex h-dvh flex-col bg-background p-4 text-foreground">
            <header>
              <h1 className="text-xl font-semibold">This week</h1>
              <p className="text-sm text-muted-foreground">
                Drag a card to move it.
              </p>
            </header>
            <Board />
          </main>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The card shows', '[data-testid=card]');
      const inTodo = yield* tab.count('[data-testid=todo] [data-testid=card]');
      yield* Proof.assert('the card starts in To do', inTodo === 1);
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.gesture(
        'Drag the card into Done',
        Gesture.drag('[data-testid=card]', '[data-testid=done]', {
          duration: '1 second',
        }),
      );
      return {
        moved: yield* tab.text('[data-testid=moved]'),
        inDone: yield* tab.count('[data-testid=done] [data-testid=card]'),
      };
    }),
  verify: ({ moved, inDone }) =>
    Effect.gen(function* () {
      yield* Proof.assert('the card is in Done', inDone === 1);
      yield* Proof.assert('the board says so', moved === 'In Done');
    }),
});
