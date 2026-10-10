import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { describe, shortcut } from '@kstackz/use-keys';
import { createKeys } from '@kstackz/use-keys/surfaces';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { position: relative; max-width: 760px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 13px Menlo, Consolas, monospace; padding: 2px 7px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  ul.threads { list-style: none; margin: 0; padding: 8px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  .threads li { padding: 10px 16px; border-radius: 10px; }
  .threads li[aria-current="true"] { background: #18181b; color: #fff; }
  .toast { display: inline-block; margin-bottom: 16px; padding: 8px 18px; border-radius: 999px; background: #e4e4e7; font-weight: 600; }
  .toast.done { background: #16a34a; color: #fff; }
  .palette { position: absolute; top: 90px; left: 50%; transform: translateX(-50%); width: 520px; background: #fff; border-radius: 16px; box-shadow: 0 30px 70px rgba(0,0,0,0.25); overflow: hidden; }
  .palette input { box-sizing: border-box; width: 100%; padding: 16px 20px; font: inherit; font-size: 20px; border: 0; border-bottom: 1px solid #e4e4e7; outline: none; }
  .palette ul { list-style: none; margin: 0; padding: 8px; }
  .palette li { display: flex; justify-content: space-between; padding: 10px 14px; border-radius: 10px; }
  .palette li:first-child { background: #eff6ff; color: #1e3a8a; }
`;

const keys = createKeys({
  actions: {
    commands: {
      keys: [shortcut('mod+k')],
      description: 'Open the command palette',
      inTextEntry: true,
    },
  },
  surfaces: {
    inbox: {
      actions: {
        next: { keys: [shortcut('j')], description: 'Next thread' },
        archive: { keys: [shortcut('e')], description: 'Archive the thread' },
        star: { keys: [shortcut('s')], description: 'Star the thread' },
      },
    },
  },
});

function Palette(props: { readonly onClose: () => void }) {
  const status = keys.useStatus();
  const run = keys.useRun();
  const [query, setQuery] = useState('');
  const found = status.actions.filter(
    (action) =>
      action.id !== 'commands' &&
      (action.state === 'active' || action.state === 'shadowed') &&
      action.description.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="palette" id="palette">
      <input
        autoFocus
        aria-label="Command"
        placeholder="Type a command"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          const first = found[0];
          if (event.key === 'Enter' && first !== undefined) {
            run(first.id);
            props.onClose();
          }
        }}
      />
      <ul>
        {found.map((action) => (
          <li key={action.id}>
            {action.description}
            <kbd>{describe(action.bindings[0]!.binding)}</kbd>
          </li>
        ))}
      </ul>
    </div>
  );
}

const threads = [
  'Quarterly report',
  'Lunch on Friday?',
  'Design review',
  'Invoice #2041',
];

function Inbox() {
  const [list, setList] = useState<ReadonlyArray<string>>(threads);
  const [at, setAt] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  keys.useAction('commands', () => setPalette(true));
  keys.useAction('inbox.next', () =>
    setAt((now) => Math.min(list.length - 1, now + 1)),
  );
  keys.useAction('inbox.archive', () => {
    setDone(`Archived “${list[at]}”`);
    setList((now) => now.filter((_, index) => index !== at));
  });
  keys.useAction('inbox.star', () => setDone(`Starred “${list[at]}”`));
  return (
    <main>
      <h1>Inbox</h1>
      <p>
        <kbd>mod</kbd> <kbd>k</kbd> finds any Action that works here and runs
        it.
      </p>
      <span className={done === null ? 'toast' : 'toast done'} id="done">
        {done ?? 'Nothing done yet'}
      </span>
      <ul className="threads">
        {list.map((each, index) => (
          <li key={each} aria-current={index === at}>
            {each}
          </li>
        ))}
      </ul>
      {palette ? <Palette onClose={() => setPalette(false)} /> : null}
    </main>
  );
}

function App() {
  return (
    <keys.Provider surface="inbox">
      <style>{css}</style>
      <Inbox />
    </keys.Provider>
  );
}

export default Proof.browser({
  title: 'A command palette runs an Action by name, just as its keys would',
  description:
    'The palette lists the Actions that work from `useStatus` and runs the chosen one with `useRun`: typing "arch" and Enter archives the selected thread without pressing e.',
  page: (root) => {
    const app = createRoot(root);
    app.render(<App />);
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* tab.press('Select the second thread', 'j');
      yield* Proof.assert(
        '"Lunch on Friday?" is selected',
        (yield* tab.text('.threads [aria-current="true"]')) ===
          'Lunch on Friday?',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.press('Open the palette', 'ControlOrMeta+k');
      const listed = yield* tab.count('.palette li');
      yield* tab.type('Search for archive', '.palette input', 'arch');
      const found = yield* tab.evaluate(() =>
        [...document.querySelectorAll('.palette li')].map((item) => [
          item.firstChild?.textContent,
          item.querySelector('kbd')?.textContent,
        ]),
      );
      yield* tab.press('Run it with Enter', 'Enter');
      return {
        listed,
        found,
        done: yield* tab.text('#done'),
        threads: yield* tab.count('.threads li'),
        paletteOpen: yield* tab.count('#palette'),
      };
    }),
  verify: ({ listed, found, done, threads, paletteOpen }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the palette listed the three inbox Actions',
        listed === 3,
      );
      yield* Proof.assert(
        '"arch" narrowed it to Archive, with its key',
        JSON.stringify(found) === JSON.stringify([['Archive the thread', 'e']]),
      );
      yield* Proof.assert(
        'Enter archived the selected thread and closed the palette',
        done === 'Archived “Lunch on Friday?”' &&
          threads === 3 &&
          paletteOpen === 0,
      );
    }),
});
