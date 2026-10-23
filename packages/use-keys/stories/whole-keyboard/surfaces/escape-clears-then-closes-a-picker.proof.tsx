import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { createKeys } from '@kestack/use-keys/surfaces';

const keys = createKeys({
  editor: {
    focusable: false,
    actions: {
      find: {
        keys: 'mod+k',
        label: 'Find a file',
        always: true,
        enters: 'picker',
      },
    },
    surfaces: {
      notes: { initial: true },
      board: {},
      picker: {
        isolated: true,
        actions: {
          clear: { keys: 'Escape', label: 'Clear the search', always: true },
        },
      },
    },
  },
});

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { position: relative; max-width: 820px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .surface { display: inline-block; margin-bottom: 16px; padding: 6px 16px; border-radius: 999px; background: #18181b; color: #fff; font-weight: 600; }
  .panes { display: flex; gap: 16px; }
  section { flex: 1; min-height: 140px; padding: 18px; background: #fff; border: 2px solid #e4e4e7; border-radius: 16px; outline: none; cursor: pointer; }
  .picker { position: absolute; top: 110px; left: 50%; transform: translateX(-50%); width: 480px; background: #fff; border-radius: 16px; box-shadow: 0 30px 70px rgba(0,0,0,0.25); overflow: hidden; outline: none; }
  .picker input { box-sizing: border-box; width: 100%; padding: 16px 20px; font: inherit; font-size: 20px; border: 0; border-bottom: 1px solid #e4e4e7; outline: none; }
  .picker ul { list-style: none; margin: 0; padding: 8px; }
  .picker li { padding: 8px 14px; border-radius: 10px; }
`;

const files = ['README.md', 'roadmap.md', 'budget.xlsx', 'reading-list.md'];

function Picker() {
  const [query, setQuery] = useState('');
  keys.useAction('picker.clear', () => setQuery(''), {
    enabled: query !== '',
  });
  return (
    <keys.Surface id="picker" className="picker" asChild>
      <div id="picker">
        <input
          autoFocus
          aria-label="File"
          placeholder="Find a file"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul>
          {files
            .filter((file) => file.includes(query.toLowerCase()))
            .map((file) => (
              <li key={file}>{file}</li>
            ))}
        </ul>
      </div>
    </keys.Surface>
  );
}

function Pane(props: {
  readonly id: 'notes' | 'board';
  readonly children: string;
}) {
  return (
    <keys.Surface id={props.id} asChild>
      <section id={props.id}>{props.children}</section>
    </keys.Surface>
  );
}

function Status() {
  const active = keys.useActive();
  return (
    <span className="surface" id="surface">
      Active Surface: {active}
    </span>
  );
}

function App() {
  // The picker is drawn while its Surface is Active: Escape closes it.
  const picking = keys.useSurface('picker').active;
  return (
    <main>
      <h1>Editor</h1>
      <p>
        <kbd>mod</kbd> <kbd>k</kbd> finds a file. In the picker, <kbd>Esc</kbd>{' '}
        clears the search first, then closes it.
      </p>
      <Status />
      <div className="panes">
        <Pane id="notes">Notes</Pane>
        <Pane id="board">Board</Pane>
      </div>
      {picking ? <Picker /> : null}
    </main>
  );
}

function Root() {
  return (
    <keys.Provider>
      <style>{css}</style>
      <App />
    </keys.Provider>
  );
}

export default Proof.browser({
  title: 'In a picker, Escape clears the search, then closes the picker',
  description:
    'Escape while typing in the picker runs its own Escape Action, which clears the search and is only Enabled while there is one. With the search empty, the next Escape leaves the isolated picker, which closes it, since it is drawn only while Active, and the board it was opened from is Active again.',
  critical: true,
  page: (root) => {
    const app = createRoot(root);
    app.render(<Root />);
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* tab.click('Click the board', '#board');
      yield* tab.press('Open the picker', 'ControlOrMeta+k');
      yield* tab.type('Search for "rea"', '#picker input', 'rea');
      yield* Proof.assert(
        'the picker is Active with "rea" in the search',
        (yield* tab.text('#surface')) === 'Active Surface: picker' &&
          (yield* tab.evaluate(
            () => document.querySelector('input')?.value,
          )) === 'rea',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      const read = Effect.all({
        surface: tab.text('#surface'),
        pickers: tab.count('#picker'),
        query: tab.evaluate(() => document.querySelector('input')?.value),
        typing: tab.evaluate(() => document.activeElement?.tagName === 'INPUT'),
      });
      yield* tab.press('Press Escape while typing', 'Escape');
      const first = yield* read;
      yield* tab.press('Press Escape again', 'Escape');
      return { first, second: yield* read };
    }),
  verify: ({ first, second }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the first Escape cleared the search and kept the picker open, still typing',
        first.pickers === 1 &&
          first.query === '' &&
          first.typing &&
          first.surface === 'Active Surface: picker',
      );
      yield* Proof.assert(
        'the second Escape closed the picker and went back to the board',
        second.pickers === 0 && second.surface === 'Active Surface: board',
      );
    }),
});
