import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider } from '@kstackz/use-keys';
import { useShortcut } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 720px; margin: 48px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 20px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .panel { padding: 20px 24px; background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.10); }
  .panel h2 { margin: 0 0 12px; font-size: 20px; }
  input { box-sizing: border-box; width: 100%; padding: 12px 16px; font: inherit; border: 1px solid #d4d4d8; border-radius: 12px; }
  input:focus { outline: 3px solid #93c5fd; border-color: #3b82f6; }
  .status { display: inline-block; margin-bottom: 20px; padding: 10px 20px; border-radius: 999px; background: #e4e4e7; color: #3f3f46; font-weight: 600; font-size: 20px; }
`;

function Page() {
  const [open, setOpen] = useState(true);
  useShortcut('Escape', () => setOpen(false), { enabled: open });
  return (
    <main>
      <h1>Tasks</h1>
      <p>
        <kbd>Esc</kbd> closes the panel. In the field, the first <kbd>Esc</kbd>{' '}
        only leaves it.
      </p>
      <span className="status" id="panel">
        {open ? 'New task panel open' : 'New task panel closed'}
      </span>
      {open ? (
        <div className="panel">
          <h2>New task</h2>
          <input aria-label="Task" placeholder="What needs doing?" />
        </div>
      ) : null}
    </main>
  );
}

export default Proof.browser({
  title: 'Escape in a text field leaves the field before it closes anything',
  description:
    'The first Escape while typing only leaves the field, so a half-written task is not lost; the next Escape reaches the Shortcut and closes the panel.',
  critical: true,
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider>
        <style>{css}</style>
        <Page />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'the panel is open',
        (yield* tab.text('#panel')) === 'New task panel open',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.type('Start writing a task', 'input', 'Water the plants');
      yield* tab.press('Press Escape in the field', 'Escape');
      const afterFirst = {
        panel: yield* tab.text('#panel'),
        inField: yield* tab.evaluate(
          () => document.activeElement?.tagName === 'INPUT',
        ),
        text: yield* tab.evaluate(() => document.querySelector('input')?.value),
      };
      yield* tab.press('Press Escape again', 'Escape');
      return { afterFirst, afterSecond: yield* tab.text('#panel') };
    }),
  verify: ({ afterFirst, afterSecond }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the first Escape left the field and kept the panel and its text',
        !afterFirst.inField &&
          afterFirst.panel === 'New task panel open' &&
          afterFirst.text === 'Water the plants',
      );
      yield* Proof.assert(
        'the second Escape closed the panel',
        afterSecond === 'New task panel closed',
      );
    }),
});
