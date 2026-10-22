import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { createKeys } from '@kestack/use-keys/surfaces';

const keys = createKeys({
  folders: { actions: { next: { keys: 'j', label: 'Next folder' } } },
  threads: {
    initial: true,
    actions: { next: { keys: 'j', label: 'Next thread' } },
  },
});

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 860px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .surface { display: inline-block; margin-bottom: 16px; padding: 8px 18px; border-radius: 999px; background: #18181b; color: #fff; font-weight: 600; }
  .panes { display: flex; gap: 16px; }
  section { padding: 14px; background: #fff; border: 2px solid #e4e4e7; border-radius: 16px; opacity: 0.55; outline: none; cursor: pointer; }
  section[data-state="active"] { border-color: #2563eb; opacity: 1; box-shadow: 0 10px 30px rgba(37,99,235,0.15); }
  section#folders { width: 220px; }
  section#threads { flex: 1; }
  h2 { margin: 0 0 8px 8px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 10px 14px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
`;

function List(props: {
  readonly id: 'folders' | 'threads';
  readonly items: ReadonlyArray<string>;
}) {
  const [at, setAt] = useState(0);
  keys.useAction(`${props.id}.next`, () =>
    setAt((now) => Math.min(props.items.length - 1, now + 1)),
  );
  return (
    <ul>
      {props.items.map((each, index) => (
        <li key={each} aria-current={index === at}>
          {each}
        </li>
      ))}
    </ul>
  );
}

function Pane(props: {
  readonly id: 'folders' | 'threads';
  readonly title: string;
  readonly items: ReadonlyArray<string>;
}) {
  return (
    <keys.Surface id={props.id} asChild>
      <section id={props.id}>
        <h2>{props.title}</h2>
        <List id={props.id} items={props.items} />
      </section>
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
  return (
    <keys.Provider vim>
      <style>{css}</style>
      <main>
        <h1>Mail</h1>
        <p>
          Both panes bind <kbd>j</kbd>; it moves only the Active Surface. Click
          a pane to enter it.
        </p>
        <Status />
        <div className="panes">
          <Pane
            id="folders"
            title="Folders"
            items={['Inbox', 'Starred', 'Sent', 'Archive']}
          />
          <Pane
            id="threads"
            title="Threads"
            items={[
              'Quarterly report',
              'Lunch on Friday?',
              'Design review',
              'Invoice #2041',
            ]}
          />
        </div>
      </main>
    </keys.Provider>
  );
}

export default Proof.browser({
  title:
    'The same key does what the Active Surface says, and nothing anywhere else',
  description:
    'The folders and the threads are two Surfaces that both bind j. Only the Active Surface hears it; clicking the folders enters them, and j moves the folders instead.',
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
        'the threads are the Active Surface',
        (yield* tab.text('#surface')) === 'Active Surface: threads',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      const selected = Effect.all({
        surface: tab.text('#surface'),
        folder: tab.text('#folders [aria-current="true"]'),
        thread: tab.text('#threads [aria-current="true"]'),
      });
      yield* tab.press('Next thread with j', 'j');
      const inThreads = yield* selected;
      yield* tab.click('Click the folders', '#folders h2');
      yield* tab.press('Press j twice in the folders', 'j', 'j');
      const inFolders = yield* selected;
      return { inThreads, inFolders };
    }),
  verify: ({ inThreads, inFolders }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'in the threads, j moved the thread and not the folder',
        inThreads.thread === 'Lunch on Friday?' && inThreads.folder === 'Inbox',
      );
      yield* Proof.assert(
        'the click made the folders Active',
        inFolders.surface === 'Active Surface: folders',
      );
      yield* Proof.assert(
        'in the folders, j moved the folder and left the thread alone',
        inFolders.folder === 'Sent' && inFolders.thread === 'Lunch on Friday?',
      );
    }),
});
