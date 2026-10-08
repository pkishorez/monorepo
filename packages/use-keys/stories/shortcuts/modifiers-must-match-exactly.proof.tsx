import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider } from '@kstackz/use-keys';
import { useShortcut } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 720px; margin: 56px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 24px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; margin: 0 0 8px; }
  ol { margin: 0; padding: 8px 8px 8px 44px; min-height: 120px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  ol li { padding: 10px 8px; font-size: 20px; font-weight: 600; }
  .empty { color: #a1a1aa; font-weight: 400; list-style: none; margin-left: -28px; }
`;

function Thread() {
  const [fired, setFired] = useState<ReadonlyArray<string>>([]);
  const log = (what: string) => () => setFired((now) => [...now, what]);
  useShortcut('s', log('Starred this thread'));
  useShortcut('shift+s', log('Starred the whole conversation'));
  return (
    <main>
      <h1>Quarterly report</h1>
      <p>
        <kbd>s</kbd> stars this thread, <kbd>shift</kbd> <kbd>s</kbd> stars the
        whole conversation
      </p>
      <h2>Shortcuts fired</h2>
      <ol>
        {fired.length === 0 ? (
          <li className="empty">Nothing yet</li>
        ) : (
          fired.map((what, index) => (
            <li key={index} className="fired">
              {what}
            </li>
          ))
        )}
      </ol>
    </main>
  );
}

export default Proof.browser({
  title: 'A Shortcut fires only when exactly its modifiers are held',
  description:
    '`s` and `shift+s` are two Shortcuts. Ctrl+S and Alt+S match neither, so nothing fires for them.',
  critical: true,
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider>
        <style>{css}</style>
        <Thread />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'no Shortcut has fired yet',
        (yield* tab.count('li.fired')) === 0,
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.press('Press Ctrl+S, which no Shortcut asks for', 'Control+s');
      yield* tab.press('Press Alt+S, which no Shortcut asks for', 'Alt+s');
      const afterOthers = yield* tab.count('li.fired');
      yield* tab.press('Press S', 's');
      yield* tab.press('Press Shift+S', 'Shift+S');
      const fired = yield* tab.evaluate(() =>
        [...document.querySelectorAll('li.fired')].map(
          (item) => item.textContent,
        ),
      );
      return { afterOthers, fired };
    }),
  verify: ({ afterOthers, fired }) =>
    Effect.gen(function* () {
      yield* Proof.assert('Ctrl+S and Alt+S fired nothing', afterOthers === 0);
      yield* Proof.assert(
        's fired only "Starred this thread", then shift+s only "Starred the whole conversation"',
        JSON.stringify(fired) ===
          JSON.stringify([
            'Starred this thread',
            'Starred the whole conversation',
          ]),
      );
    }),
});
