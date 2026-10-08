import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider, shortcut } from '@kstackz/use-keys';
import { useShortcut } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 720px; margin: 56px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 24px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  ul { list-style: none; margin: 0; padding: 8px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  li { padding: 14px 18px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
`;

const threads = [
  'Quarterly report',
  'Lunch on Friday?',
  'Design review notes',
  'Invoice #2041',
  'Welcome aboard',
];

function Inbox() {
  const [at, setAt] = useState(0);
  const move = (by: number) =>
    setAt((now) => Math.min(threads.length - 1, Math.max(0, now + by)));
  useShortcut([shortcut('j'), shortcut('ArrowDown')], () => move(1));
  useShortcut([shortcut('k'), shortcut('ArrowUp')], () => move(-1));
  return (
    <main>
      <h1>Inbox</h1>
      <p>
        <kbd>j</kbd> or <kbd>↓</kbd> next thread, <kbd>k</kbd> or <kbd>↑</kbd>{' '}
        previous
      </p>
      <ul>
        {threads.map((thread, index) => (
          <li key={thread} aria-current={index === at}>
            {thread}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default Proof.browser({
  title: 'j and k move through a list, and so do the arrow keys',
  description:
    'Each useShortcut takes a list of alternatives: j or ↓ moves down, k or ↑ moves up.',
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider>
        <style>{css}</style>
        <Inbox />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      const current = yield* tab.text('li[aria-current="true"]');
      yield* Proof.assert(
        'the first thread is selected',
        current === 'Quarterly report',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.press('Move down twice with j', 'j', 'j');
      const afterJ = yield* tab.text('li[aria-current="true"]');
      yield* tab.press('Move up with k', 'k');
      const afterK = yield* tab.text('li[aria-current="true"]');
      yield* tab.press(
        'Move down twice with the arrow',
        'ArrowDown',
        'ArrowDown',
      );
      const afterArrows = yield* tab.text('li[aria-current="true"]');
      return { afterJ, afterK, afterArrows };
    }),
  verify: (selected) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'j j selects the third thread',
        selected.afterJ === 'Design review notes',
      );
      yield* Proof.assert(
        'k goes back to the second',
        selected.afterK === 'Lunch on Friday?',
      );
      yield* Proof.assert(
        '↓ ↓ selects the fourth',
        selected.afterArrows === 'Invoice #2041',
      );
    }),
});
