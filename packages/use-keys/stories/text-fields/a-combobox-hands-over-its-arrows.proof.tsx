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
  .combo { background: #fff; border: 1px solid #d4d4d8; border-radius: 14px; overflow: hidden; }
  input { box-sizing: border-box; width: 100%; padding: 14px 18px; font: inherit; border: 0; border-bottom: 1px solid #e4e4e7; outline: none; }
  ul { list-style: none; margin: 0; padding: 8px; }
  li { padding: 10px 16px; border-radius: 10px; }
  li[aria-selected="true"] { background: #2563eb; color: #fff; }
  .status { display: inline-block; margin-top: 20px; padding: 10px 20px; border-radius: 999px; background: #e4e4e7; color: #3f3f46; font-weight: 600; font-size: 20px; }
  .status.picked { background: #16a34a; color: #fff; }
`;

const fruits = ['Apple', 'Apricot', 'Banana', 'Blackberry', 'Cherry', 'Grape'];

function FruitPicker() {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const shown = fruits.filter((fruit) =>
    fruit.toLowerCase().includes(query.toLowerCase()),
  );
  useShortcut('ArrowDown', () =>
    setAt((now) => Math.min(shown.length - 1, now + 1)),
  );
  useShortcut('ArrowUp', () => setAt((now) => Math.max(0, now - 1)));
  useShortcut('Enter', () => setPicked(shown[at] ?? null));
  return (
    <main>
      <h1>Pick a fruit</h1>
      <p>
        Type to filter; <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd> work from
        inside the field because it hands its keys over.
      </p>
      <div className="combo" data-keys="enabled">
        <input
          aria-label="Fruit"
          placeholder="Search fruit"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setAt(0);
          }}
        />
        <ul>
          {shown.map((fruit, index) => (
            <li key={fruit} aria-selected={index === at}>
              {fruit}
            </li>
          ))}
        </ul>
      </div>
      <span
        className={picked === null ? 'status' : 'status picked'}
        id="picked"
      >
        {picked === null ? 'Nothing picked' : `Picked ${picked}`}
      </span>
    </main>
  );
}

export default Proof.browser({
  title:
    'A field marked data-keys="enabled" hands its arrows and Enter to your Shortcuts',
  description:
    'The combobox is Taken Over: plain ↓ and Enter Shortcuts work while typing in it, and the letters nobody Takes still type.',
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider>
        <style>{css}</style>
        <FruitPicker />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'all six fruits are listed and nothing is picked',
        (yield* tab.count('li')) === 6 &&
          (yield* tab.text('#picked')) === 'Nothing picked',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.type('Type "b" to filter', 'input', 'b');
      const shown = yield* tab.count('li');
      yield* tab.press('Move down with the arrow', 'ArrowDown');
      yield* tab.press('Pick with Enter', 'Enter');
      return {
        query: yield* tab.evaluate(
          () => document.querySelector('input')?.value,
        ),
        shown,
        stillInField: yield* tab.evaluate(
          () => document.activeElement?.tagName === 'INPUT',
        ),
        picked: yield* tab.text('#picked'),
      };
    }),
  verify: ({ query, shown, stillInField, picked }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the letter typed into the field and filtered the list',
        query === 'b' && shown === 2,
      );
      yield* Proof.assert(
        '↓ then Enter picked the second match from inside the field',
        picked === 'Picked Blackberry' && stillInField,
      );
    }),
});
