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
  input { box-sizing: border-box; width: 100%; margin-bottom: 16px; padding: 12px 16px; font: inherit; border: 1px solid #d4d4d8; border-radius: 12px; background: #fff; }
  input:focus { outline: 3px solid #93c5fd; border-color: #3b82f6; }
  ul { list-style: none; margin: 0; padding: 8px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  li { padding: 12px 18px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
`;

const people = [
  'Ada Lovelace',
  'Grace Hopper',
  'Joan Clarke',
  'Katherine Johnson',
];

function People() {
  const [at, setAt] = useState(0);
  useShortcut('j', () => setAt((now) => Math.min(people.length - 1, now + 1)));
  useShortcut('k', () => setAt((now) => Math.max(0, now - 1)));
  return (
    <main>
      <h1>People</h1>
      <p>
        <kbd>j</kbd> and <kbd>k</kbd> move through the list. In the search field
        they just type; <kbd>Esc</kbd> leaves it.
      </p>
      <input placeholder="Search people" aria-label="Search" />
      <ul>
        {people.map((person, index) => (
          <li key={person} aria-current={index === at}>
            {person}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default Proof.browser({
  title: 'Typing j and k in a search field types them and moves nothing',
  description:
    'A text field keeps its plain keys: the j and k Shortcuts do not fire while typing there. After Escape leaves the field, j moves the list again.',
  critical: true,
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider>
        <style>{css}</style>
        <People />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'the first person is selected',
        (yield* tab.text('li[aria-current="true"]')) === 'Ada Lovelace',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.type('Type "jojk" into search', 'input', 'jojk');
      const typed = yield* tab.evaluate(
        () => document.querySelector('input')?.value,
      );
      const whileTyping = yield* tab.text('li[aria-current="true"]');
      yield* tab.press('Leave the field', 'Escape');
      const focusLeft = yield* tab.evaluate(
        () => document.activeElement === document.body,
      );
      yield* tab.press('Press j on the page', 'j');
      const afterLeaving = yield* tab.text('li[aria-current="true"]');
      return { typed, whileTyping, focusLeft, afterLeaving };
    }),
  verify: ({ typed, whileTyping, focusLeft, afterLeaving }) =>
    Effect.gen(function* () {
      yield* Proof.assert('the field holds "jojk"', typed === 'jojk');
      yield* Proof.assert(
        'the selection did not move while typing',
        whileTyping === 'Ada Lovelace',
      );
      yield* Proof.assert('Escape left the field', focusLeft);
      yield* Proof.assert(
        'j moved the selection once outside the field',
        afterLeaving === 'Grace Hopper',
      );
    }),
});
