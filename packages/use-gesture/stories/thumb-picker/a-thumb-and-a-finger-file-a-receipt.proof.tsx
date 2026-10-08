import {
  createGestureProvider,
  type PointerSample,
  thumbLock,
  TreeWalk,
  type ZoneTree,
} from '@kstackz/use-gesture';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

type Target = Element | null;
type Folder = {
  readonly id: string;
  readonly label: string;
  readonly children?: ReadonlyArray<Folder>;
};

const DOM: ZoneTree<Element, Target> = {
  zoneOf: (target) => target?.closest('[data-zone]') ?? null,
  parentOf: (zone) => zone.parentElement?.closest('[data-zone]') ?? null,
  trapped: () => false,
};

const FOLDERS: ReadonlyArray<Folder> = [
  { id: 'inbox', label: 'Inbox' },
  {
    id: 'work',
    label: 'Work',
    children: [
      { id: 'design', label: 'Design' },
      { id: 'hiring', label: 'Hiring' },
      { id: 'budget', label: 'Budget' },
    ],
  },
  { id: 'home', label: 'Home' },
];
const START = ['inbox'];
// Every list the walk can open, drawn up front.
const LISTS = TreeWalk.lists(FOLDERS, START);

// The Thumb Lock and the Tree Walk straight from the core, with a picker
// drawn here: the platform-free pieces web-platform's ThumbPicker is made of.
function Mover() {
  const screen = useRef<HTMLDivElement>(null);
  const [walk, setWalk] = useState<TreeWalk.Walk>();
  const [moved, setMoved] = useState('In Inbox');
  const [told, setTold] = useState<ReadonlyArray<string>>([]);

  useEffect(() => {
    const zone = screen.current;
    if (zone === null) return;
    const provider = createGestureProvider(DOM);
    let current: TreeWalk.Walk | undefined;
    const show = (next: TreeWalk.Walk | undefined) => {
      current = next;
      setWalk(next);
    };
    const removeZone = provider.addZone(zone);
    const removeListener = provider.addGesture(
      zone,
      thumbLock<Target>({
        enabled: () => true,
        width: () => innerWidth,
        onLock: () => {
          setTold(['lock']);
          show(TreeWalk.begin(FOLDERS, START));
        },
        onMove: (finger) => {
          if (current === undefined) return;
          const after = TreeWalk.move(current, FOLDERS, START, finger);
          if (after.events.length > 0) {
            setTold((all) => [...all, ...after.events]);
          }
          show(after.walk);
        },
        onEnd: (lifted) => {
          const last = current;
          show(undefined);
          if (!lifted || last === undefined) return;
          const folder = TreeWalk.chosen(last, FOLDERS, START);
          if (folder === undefined) return;
          const parent = TreeWalk.choiceAt(FOLDERS, last.path.slice(0, -1));
          setMoved(
            `Moved to ${last.path.length > 1 && parent ? `${parent.label} › ` : ''}${folder.label}`,
          );
        },
      }),
    );
    const sample = (event: PointerEvent): PointerSample<Target> => ({
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
      target: event.target instanceof Element ? event.target : null,
    });
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') provider.sink.down(sample(event));
    };
    const move = (event: PointerEvent) => provider.sink.move(sample(event));
    const up = (event: PointerEvent) => provider.sink.up(sample(event));
    const cancel = (event: PointerEvent) =>
      provider.sink.cancelAll(event.timeStamp);
    addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
    return () => {
      removeEventListener('pointerdown', down);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      removeListener();
      removeZone();
    };
  }, []);

  const columns =
    walk === undefined || !walk.shown
      ? []
      : TreeWalk.columns(walk, FOLDERS, START);

  return (
    <div ref={screen} data-zone="" className="screen locked">
      <h1>Receipt from Café Blue</h1>
      <p className="hint">
        Rest your left thumb and swipe to move it to a folder.
      </p>
      <div className="columns">
        {LISTS.map((list) => {
          const column = columns.find((each) => each.id === list.id);
          if (column === undefined) return null;
          return (
            <ul
              key={list.id}
              data-testid={`list-${list.id || 'top'}`}
              className="list"
            >
              {list.choices.map((folder, index) => (
                <li
                  key={folder.id}
                  aria-current={index === column.marked || undefined}
                  className={index === column.marked ? 'marked' : undefined}
                >
                  {folder.label}
                  {TreeWalk.opens(folder) && <span aria-hidden="true">›</span>}
                </li>
              ))}
            </ul>
          );
        })}
      </div>
      <section className="told">
        <p className="label">
          Told by the walk · a move every {TreeWalk.DISTANCES.step}px
        </p>
        <p data-testid="told" className="events">
          {told.length === 0 ? '—' : told.join(' · ')}
        </p>
      </section>
      <footer className="readout">
        <p className="label">Receipt</p>
        <p data-testid="moved" className="value">
          {moved}
        </p>
      </footer>
    </div>
  );
}

// Plain CSS: the core needs no styling system.
const STYLE = `
body { margin: 0; font: 16px/1.4 system-ui, sans-serif; color: #0a0a0a; background: #fff; }
.screen { display: flex; flex-direction: column; height: 100dvh; padding: 16px; box-sizing: border-box; }
h1 { margin: 0; font-size: 20px; font-weight: 600; }
.hint { margin: 0; font-size: 14px; color: #737373; }
.readout { position: fixed; left: 16px; right: 16px; bottom: 24px; z-index: 10; padding: 16px 20px; border-radius: 16px; background: #0a0a0a; color: #fff; box-shadow: 0 10px 25px rgba(0,0,0,.2); }
.label { margin: 0; font-size: 12px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; opacity: .6; }
.value { margin: 0; font-size: 22px; font-weight: 600; }
.locked { touch-action: none; user-select: none; }
.columns { display: flex; gap: 8px; margin-top: 24px; }
.list { width: 144px; margin: 0; padding: 4px; list-style: none; border: 1px solid #e5e5e5; border-radius: 16px; background: #fff; box-shadow: 0 10px 15px rgba(0,0,0,.1); }
.list li { display: flex; justify-content: space-between; padding: 8px 12px; border-radius: 12px; }
.list li.marked { background: #0a0a0a; color: #fff; font-weight: 500; }
.told { position: fixed; left: 16px; right: 16px; bottom: 144px; padding: 16px; border-radius: 16px; background: #f5f5f5; }
.told .label { color: #737373; opacity: 1; }
.events { margin: 4px 0 0; font: 14px ui-monospace, monospace; }
`;

export default Proof.browser({
  title:
    'A resting thumb and a moving finger walk a menu and file a receipt in a folder',
  description:
    'thumbLock listens on a provider fed by the page’s own pointer events and drives a Tree Walk; the menu is drawn from it. A Step down to Work, right to open it, down to Hiring, and lifting the finger chooses.',
  page: (root) => {
    const app = createRoot(root);
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
    app.render(<Mover />);
    return () => {
      app.unmount();
      style.remove();
    };
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The receipt shows', '[data-testid=moved]');
      const moved = yield* tab.text('[data-testid=moved]');
      yield* Proof.assert('the receipt is in Inbox', moved === 'In Inbox');
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      const way = (
        corners: ReadonlyArray<{ x: number; y: number; t: number }>,
      ) =>
        corners.flatMap((to, index) => {
          const from = corners[index - 1];
          if (from === undefined) return [to];
          const steps = Math.max(1, Math.round((to.t - from.t) / 16));
          return Array.from({ length: steps }, (_, step) => {
            const t = (step + 1) / steps;
            const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
            return {
              x: from.x + (to.x - from.x) * eased,
              y: from.y + (to.y - from.y) * eased,
              t: from.t + (to.t - from.t) * t,
            };
          });
        });
      const finger = way([
        { x: 300, y: 420, t: 300 },
        { x: 300, y: 420, t: 450 },
        { x: 300, y: 462, t: 900 },
        { x: 344, y: 462, t: 1350 },
        { x: 344, y: 502, t: 1800 },
        { x: 344, y: 502, t: 2300 },
      ]);
      const thumb = [
        { x: 86, y: 560, t: 0 },
        { x: 86, y: 560, t: 2700 },
      ];
      yield* tab.gesture(
        'Rest the thumb and swipe to Work › Hiring',
        Gesture.fingers([thumb, finger]),
      );
      return {
        moved: yield* tab.text('[data-testid=moved]'),
        told: yield* tab.text('[data-testid=told]'),
      };
    }),
  verify: ({ moved, told }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the walk locked, stepped, opened and stepped (${told})`,
        told === 'lock · step · open · step',
      );
      yield* Proof.assert(
        'lifting the finger moved it to Work › Hiring',
        moved === 'Moved to Work › Hiring',
      );
    }),
});
