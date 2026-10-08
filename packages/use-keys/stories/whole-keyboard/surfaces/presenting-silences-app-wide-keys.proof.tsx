import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { shortcut } from '@kstackz/use-keys';
import { createKeys } from '@kstackz/use-keys/surfaces';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 760px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .bar { display: flex; gap: 12px; margin-bottom: 16px; }
  .pill { padding: 6px 16px; border-radius: 999px; background: #18181b; color: #fff; font-weight: 600; }
  .pill.notes { background: #e4e4e7; color: #3f3f46; }
  .pill.notes.on { background: #f59e0b; color: #fff; }
  .board { padding: 24px; min-height: 260px; background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; }
  .slide { display: grid; place-items: center; min-height: 300px; border-radius: 16px; background: #1e1b4b; color: #fff; font-size: 40px; font-weight: 700; }
`;

const keys = createKeys({
  actions: {
    notes: { keys: [shortcut('n')], description: 'Show speaker notes' },
  },
  surfaces: {
    editor: {
      actions: {
        present: { keys: [shortcut('p')], description: 'Start presenting' },
      },
    },
    slideshow: {
      globals: false,
      actions: {
        next: { keys: [shortcut('ArrowRight')], description: 'Next slide' },
        exit: { keys: [shortcut('Escape')], description: 'Stop presenting' },
      },
    },
  },
});

function Deck() {
  const { surface, openSurface, closeSurface } = keys.useSurface();
  const [notes, setNotes] = useState(false);
  const [slide, setSlide] = useState(1);
  keys.useAction('notes', () => setNotes((now) => !now));
  keys.useAction('editor.present', () => openSurface('slideshow'));
  keys.useAction('slideshow.next', () => setSlide((now) => now + 1));
  keys.useAction('slideshow.exit', () => closeSurface('slideshow'));
  return (
    <main>
      <h1>Launch deck</h1>
      <p>
        <kbd>n</kbd> toggles speaker notes anywhere but the slideshow.{' '}
        <kbd>p</kbd> presents, <kbd>→</kbd> next slide, <kbd>Esc</kbd> stops.
      </p>
      <div className="bar">
        <span className="pill" id="surface">
          Active Surface: {surface ?? 'none'}
        </span>
        <span className={notes ? 'pill notes on' : 'pill notes'} id="notes">
          {notes ? 'Speaker notes shown' : 'Speaker notes hidden'}
        </span>
      </div>
      {surface === 'slideshow' ? (
        <div className="slide" id="slide">
          Slide {slide}
        </div>
      ) : (
        <div className="board">Editing slide {slide}</div>
      )}
    </main>
  );
}

function App() {
  const [surface, setSurface] = useState<'editor' | 'slideshow' | null>(
    'editor',
  );
  return (
    <keys.Provider surface={surface} onSurfaceChange={setSurface}>
      <style>{css}</style>
      <Deck />
    </keys.Provider>
  );
}

export default Proof.browser({
  title:
    'A Surface with globals off silences the app-wide keys while it is active',
  description:
    'The slideshow sets `globals: false`, so the global n does nothing while presenting. Back in the editor, n works again.',
  critical: true,
  page: (root) => {
    const app = createRoot(root);
    app.render(<App />);
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'the editor is Active with notes hidden',
        (yield* tab.text('#surface')) === 'Active Surface: editor' &&
          (yield* tab.text('#notes')) === 'Speaker notes hidden',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.press('Start presenting with p', 'p');
      yield* tab.press('Press n while presenting', 'n');
      yield* tab.press('Next slide', 'ArrowRight');
      const presenting = {
        surface: yield* tab.text('#surface'),
        notes: yield* tab.text('#notes'),
        slide: yield* tab.text('#slide'),
      };
      yield* tab.press('Stop presenting with Escape', 'Escape');
      yield* tab.press('Press n in the editor', 'n');
      return {
        presenting,
        editing: {
          surface: yield* tab.text('#surface'),
          notes: yield* tab.text('#notes'),
        },
      };
    }),
  verify: ({ presenting, editing }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the slideshow was Active and → moved to slide 2',
        presenting.surface === 'Active Surface: slideshow' &&
          presenting.slide === 'Slide 2',
      );
      yield* Proof.assert(
        'n did nothing while presenting',
        presenting.notes === 'Speaker notes hidden',
      );
      yield* Proof.assert(
        'Escape went back to the editor, where n showed the notes',
        editing.surface === 'Active Surface: editor' &&
          editing.notes === 'Speaker notes shown',
      );
    }),
});
