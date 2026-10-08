import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider, shortcut } from '@kstackz/use-keys';
import { useSequence, useShortcut } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 720px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  input { box-sizing: border-box; width: 100%; margin-bottom: 16px; padding: 12px 16px; font: inherit; border: 1px solid #d4d4d8; border-radius: 12px; background: #fff; }
  input:focus { outline: 3px solid #93c5fd; border-color: #3b82f6; }
  ul { list-style: none; margin: 0; padding: 8px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  li { padding: 10px 18px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
`;

const tasks = [
  'Book the venue',
  'Send the invitations',
  'Order the cake',
  'Pick a playlist',
  'Buy candles',
];

function Tasks() {
  const [at, setAt] = useState(0);
  const move = (by: number) =>
    setAt((now) => Math.min(tasks.length - 1, Math.max(0, now + by)));
  useShortcut([shortcut('j'), shortcut('ArrowDown')], () => move(1));
  useShortcut([shortcut('k'), shortcut('ArrowUp')], () => move(-1));
  useSequence('g g', () => setAt(0));
  return (
    <main>
      <h1>Party tasks</h1>
      <p>
        <kbd>j</kbd> and <kbd>k</kbd> move, <kbd>g</kbd> <kbd>g</kbd> goes back
        to the top. In the search field every key just types.
      </p>
      <input placeholder="Search tasks" aria-label="Search" />
      <ul>
        {tasks.map((task, index) => (
          <li key={task} aria-current={index === at}>
            {task}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default Proof.browser({
  title:
    'j, k and g g drive a list, and typing the same letters in its search field moves nothing',
  description:
    'Shortcuts, a Sequence and a text field on one page, under one provider: the keys work on the page, step aside while you type, and work again after Escape.',
  critical: true,
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider sequence={{ timeout: 2000 }}>
        <style>{css}</style>
        <Tasks />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'the first task is selected',
        (yield* tab.text('li[aria-current="true"]')) === 'Book the venue',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.press('Move down twice', 'j', 'j');
      const afterJ = yield* tab.text('li[aria-current="true"]');
      yield* tab.press('Move back up one', 'k');
      const afterK = yield* tab.text('li[aria-current="true"]');
      yield* tab.type('Search for "jog"', 'input', 'jog');
      const typed = yield* tab.evaluate(
        () => document.querySelector('input')?.value,
      );
      const whileTyping = yield* tab.text('li[aria-current="true"]');
      yield* tab.press('Leave the field', 'Escape');
      yield* tab.press('Move down', 'j');
      const afterLeaving = yield* tab.text('li[aria-current="true"]');
      yield* tab.press('Go back to the top', 'g', 'g');
      const afterGG = yield* tab.text('li[aria-current="true"]');
      return { afterJ, afterK, typed, whileTyping, afterLeaving, afterGG };
    }),
  verify: ({ afterJ, afterK, typed, whileTyping, afterLeaving, afterGG }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'j j moved down two tasks',
        afterJ === 'Order the cake',
      );
      yield* Proof.assert(
        'k moved back up one',
        afterK === 'Send the invitations',
      );
      yield* Proof.assert('the search field holds "jog"', typed === 'jog');
      yield* Proof.assert(
        'typing j and g in the field moved nothing',
        whileTyping === 'Send the invitations',
      );
      yield* Proof.assert(
        'after Escape, j moves the list again',
        afterLeaving === 'Order the cake',
      );
      yield* Proof.assert(
        'g g went back to the first task',
        afterGG === 'Book the venue',
      );
    }),
});
