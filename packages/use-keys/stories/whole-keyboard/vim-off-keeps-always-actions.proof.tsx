import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { createKeys } from '@kestack/use-keys/surfaces';

const keys = createKeys({
  inbox: {
    actions: {
      next: { keys: 'j', label: 'Next thread' },
      search: { keys: 'mod+k', label: 'Search', always: true },
    },
  },
});

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 760px; margin: 40px auto; padding: 0 24px; outline: none; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .bar { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
  .vim { padding: 6px 16px; border-radius: 999px; background: #e4e4e7; font-weight: 600; }
  .vim.on { background: #16a34a; color: #fff; }
  .searches { color: #52525b; }
  button { font: inherit; font-weight: 600; padding: 8px 16px; border: 0; border-radius: 10px; background: #2563eb; color: #fff; cursor: pointer; }
  ul { list-style: none; margin: 0; padding: 8px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  li { padding: 10px 16px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
`;

const threads = [
  'Quarterly report',
  'Lunch on Friday?',
  'Design review',
  'Invoice #2041',
];

function Inbox() {
  const { vim } = keys.useKeyboard();
  const [at, setAt] = useState(0);
  const [searches, setSearches] = useState(0);
  keys.useAction('inbox.next', () =>
    setAt((now) => Math.min(threads.length - 1, now + 1)),
  );
  keys.useAction('inbox.search', () => setSearches((now) => now + 1));
  return (
    <>
      <div className="bar">
        <span className={vim.on ? 'vim on' : 'vim'} id="vim">
          Vim Mode {vim.on ? 'on' : 'off'}
        </span>
        <span className="searches" id="searches">
          Searches: {searches}
        </span>
        <button onClick={() => vim.set(true)}>Turn Vim Mode on</button>
      </div>
      <ul>
        {threads.map((each, index) => (
          <li key={each} aria-current={index === at}>
            {each}
          </li>
        ))}
      </ul>
    </>
  );
}

function App() {
  return (
    <keys.Provider>
      <style>{css}</style>
      <keys.Surface id="inbox" asChild>
        <main>
          <h1>Inbox</h1>
          <p>
            <kbd>j</kbd> is a Vim key: it works only with Vim Mode on.{' '}
            <kbd>mod</kbd> <kbd>k</kbd> is marked Always, so it works either
            way.
          </p>
          <Inbox />
        </main>
      </keys.Surface>
    </keys.Provider>
  );
}

export default Proof.browser({
  title: 'With Vim Mode off, only the Always Actions work',
  description:
    'Actions are Vim keys unless marked `always`. With Vim Mode off, as the provider starts, j does nothing while mod+k still searches. Turning Vim Mode on with useVim makes j move.',
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
        'Vim Mode is off',
        (yield* tab.text('#vim')) === 'Vim Mode off',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      const read = Effect.all({
        vim: tab.text('#vim'),
        thread: tab.text('li[aria-current="true"]'),
        searches: tab.text('#searches'),
      });
      yield* tab.press('Press j', 'j');
      yield* tab.press('Search with mod+k', 'ControlOrMeta+k');
      const off = yield* read;
      yield* tab.click(
        'Turn Vim Mode on',
        'role=button[name="Turn Vim Mode on"]',
      );
      yield* tab.press('Press j again', 'j');
      return { off, on: yield* read };
    }),
  verify: ({ off, on }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'with Vim Mode off, j did not move',
        off.thread === 'Quarterly report',
      );
      yield* Proof.assert(
        'with Vim Mode off, the Always mod+k searched',
        off.searches === 'Searches: 1',
      );
      yield* Proof.assert(
        'with Vim Mode on, j moved',
        on.vim === 'Vim Mode on' && on.thread === 'Lunch on Friday?',
      );
    }),
});
