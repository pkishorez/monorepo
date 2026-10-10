import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider } from '@kstackz/use-keys';
import { useShortcut } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 760px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 20px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .row { display: flex; gap: 16px; }
  .layers { width: 240px; }
  ul { list-style: none; margin: 0; padding: 8px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  li { padding: 10px 16px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
  .canvas { position: relative; flex: 1; height: 260px; background: #fff; border: 1px dashed #a1a1aa; border-radius: 14px; outline: none; }
  .canvas:focus { border: 2px solid #2563eb; }
  .canvas .dot { position: absolute; width: 28px; height: 28px; border-radius: 50%; background: #2563eb; transition: top 120ms ease-out; }
  .canvas .label { position: absolute; left: 16px; bottom: 12px; color: #71717a; }
`;

const layers = ['Background', 'Logo', 'Headline', 'Button'];

function Designer() {
  const [layer, setLayer] = useState(0);
  const [y, setY] = useState(20);
  useShortcut('j', () =>
    setLayer((now) => Math.min(layers.length - 1, now + 1)),
  );
  return (
    <main>
      <h1>Designer</h1>
      <p>
        <kbd>j</kbd> selects the next layer. The canvas keeps every key for
        itself: there, <kbd>j</kbd> nudges the dot down.
      </p>
      <div className="row">
        <div className="layers">
          <ul>
            {layers.map((each, index) => (
              <li key={each} aria-current={index === layer}>
                {each}
              </li>
            ))}
          </ul>
        </div>
        <div
          className="canvas"
          tabIndex={0}
          data-keys="disabled"
          aria-label="Canvas"
          onKeyDown={(event) => {
            if (event.key === 'j') setY((now) => now + 40);
          }}
        >
          <div className="dot" style={{ left: 40, top: y }} id="dot" />
          <span className="label">Canvas: click, then j nudges the dot</span>
        </div>
      </div>
    </main>
  );
}

export default Proof.browser({
  title:
    'An area marked data-keys="disabled" keeps its keys from every Shortcut',
  description:
    'The canvas is Left Alone: j there nudges its own dot and never selects a layer. Outside it, j selects the next layer again.',
  critical: true,
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider>
        <style>{css}</style>
        <Designer />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'the Background layer is selected',
        (yield* tab.text('li[aria-current="true"]')) === 'Background',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.click('Click the canvas', '.canvas');
      yield* tab.press('Press j twice on the canvas', 'j', 'j');
      const onCanvas = {
        layer: yield* tab.text('li[aria-current="true"]'),
        dot: yield* tab.evaluate(
          () => (document.getElementById('dot') as HTMLElement).style.top,
        ),
      };
      yield* tab.click('Click the heading, outside the canvas', 'h1');
      yield* tab.press('Press j on the page', 'j');
      return { onCanvas, onPage: yield* tab.text('li[aria-current="true"]') };
    }),
  verify: ({ onCanvas, onPage }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'j on the canvas moved its dot twice',
        onCanvas.dot === '100px',
      );
      yield* Proof.assert(
        'j on the canvas selected no layer',
        onCanvas.layer === 'Background',
      );
      yield* Proof.assert(
        'j outside the canvas selected the next layer',
        onPage === 'Logo',
      );
    }),
});
