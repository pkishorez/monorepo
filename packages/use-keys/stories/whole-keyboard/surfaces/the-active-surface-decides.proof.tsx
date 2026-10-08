import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { shortcut } from '@kstackz/use-keys';
import { createKeys } from '@kstackz/use-keys/surfaces';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 860px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .surface { display: inline-block; margin-bottom: 16px; padding: 8px 18px; border-radius: 999px; background: #18181b; color: #fff; font-weight: 600; }
  .panes { display: flex; gap: 16px; }
  section { padding: 14px; background: #fff; border: 2px solid #e4e4e7; border-radius: 16px; opacity: 0.55; }
  section.active { border-color: #2563eb; opacity: 1; box-shadow: 0 10px 30px rgba(37,99,235,0.15); }
  section.folders { width: 220px; }
  section.inbox { flex: 1; }
  h2 { margin: 0 0 8px 8px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 10px 14px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
`;

const keys = createKeys({
  surfaces: {
    folders: {
      actions: {
        next: { keys: [shortcut('j')], description: 'Next folder' },
        inbox: { keys: [shortcut('ctrl+l')], description: 'Go to the inbox' },
      },
    },
    inbox: {
      actions: {
        next: { keys: [shortcut('j')], description: 'Next thread' },
        folders: {
          keys: [shortcut('ctrl+h')],
          description: 'Go to the folders',
        },
      },
    },
  },
});

const folders = ['Inbox', 'Starred', 'Sent', 'Archive'];
const threads = [
  'Quarterly report',
  'Lunch on Friday?',
  'Design review',
  'Invoice #2041',
];

function Folders() {
  const { surface, setSurface } = keys.useSurface();
  const [at, setAt] = useState(0);
  keys.useAction('folders.next', () =>
    setAt((now) => Math.min(folders.length - 1, now + 1)),
  );
  keys.useAction('folders.inbox', () => setSurface('inbox'));
  return (
    <section className={surface === 'folders' ? 'folders active' : 'folders'}>
      <h2>Folders</h2>
      <ul id="folders">
        {folders.map((each, index) => (
          <li key={each} aria-current={index === at}>
            {each}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Inbox() {
  const { surface, setSurface } = keys.useSurface();
  const [at, setAt] = useState(0);
  keys.useAction('inbox.next', () =>
    setAt((now) => Math.min(threads.length - 1, now + 1)),
  );
  keys.useAction('inbox.folders', () => setSurface('folders'));
  return (
    <section className={surface === 'inbox' ? 'inbox active' : 'inbox'}>
      <h2>Threads</h2>
      <ul id="threads">
        {threads.map((each, index) => (
          <li key={each} aria-current={index === at}>
            {each}
          </li>
        ))}
      </ul>
    </section>
  );
}

function App() {
  const [surface, setSurface] = useState<'folders' | 'inbox' | null>('inbox');
  return (
    <keys.Provider surface={surface} onSurfaceChange={setSurface}>
      <style>{css}</style>
      <main>
        <h1>Mail</h1>
        <p>
          <kbd>j</kbd> moves within the Active Surface. <kbd>ctrl</kbd>{' '}
          <kbd>h</kbd> goes to the folders, <kbd>ctrl</kbd> <kbd>l</kbd> back to
          the threads.
        </p>
        <span className="surface" id="surface">
          Active Surface: {surface ?? 'none'}
        </span>
        <div className="panes">
          <Folders />
          <Inbox />
        </div>
      </main>
    </keys.Provider>
  );
}

export default Proof.browser({
  title:
    'The same key does what the active Surface says, and nothing anywhere else',
  description:
    'The folders and the inbox both bind j. Only the Active Surface’s Action works; an Action’s Handler moves to the other Surface.',
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
        'the inbox is the Active Surface',
        (yield* tab.text('#surface')) === 'Active Surface: inbox',
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
      const inInbox = yield* selected;
      yield* tab.press('Go to the folders with Ctrl+H', 'Control+h');
      yield* tab.press('Press j twice in the folders', 'j', 'j');
      const inFolders = yield* selected;
      return { inInbox, inFolders };
    }),
  verify: ({ inInbox, inFolders }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'in the inbox, j moved the thread and not the folder',
        inInbox.thread === 'Lunch on Friday?' && inInbox.folder === 'Inbox',
      );
      yield* Proof.assert(
        'Ctrl+H made the folders Active',
        inFolders.surface === 'Active Surface: folders',
      );
      yield* Proof.assert(
        'in the folders, j moved the folder and left the thread alone',
        inFolders.folder === 'Sent' && inFolders.thread === 'Lunch on Friday?',
      );
    }),
});
