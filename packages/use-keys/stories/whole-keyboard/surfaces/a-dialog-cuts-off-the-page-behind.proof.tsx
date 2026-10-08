import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { shortcut } from '@kstackz/use-keys';
import { createKeys } from '@kstackz/use-keys/surfaces';

const css = `
  body { margin: 0; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; transition: background 200ms; }
  body:has(.dark) { background: #27272a; }
  body:has(.light) { background: #f4f4f5; }
  main { position: relative; max-width: 720px; margin: 40px auto; padding: 24px; border-radius: 20px; }
  main.dark { background: #18181b; color: #fafafa; }
  main.dark p { color: #a1a1aa; }
  main.dark ul { background: #27272a; border-color: #3f3f46; }
  main.dark li[aria-current="true"] { background: #fafafa; color: #18181b; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .surface { display: inline-block; margin-bottom: 14px; padding: 6px 16px; border-radius: 999px; background: #2563eb; color: #fff; font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 8px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  li { padding: 10px 16px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
  .backdrop { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(24,24,27,0.45); border-radius: 20px; }
  .dialog { width: 380px; padding: 22px 24px; background: #fff; color: #18181b; border-radius: 16px; box-shadow: 0 30px 60px rgba(0,0,0,0.3); }
  .dialog h2 { margin: 0 0 8px; font-size: 22px; }
  .dialog p { margin: 0; }
`;

const keys = createKeys({
  actions: {
    theme: { keys: [shortcut('t')], description: 'Switch light and dark' },
  },
  surfaces: {
    files: {
      actions: {
        next: { keys: [shortcut('j')], description: 'Next file' },
        remove: { keys: [shortcut('d')], description: 'Delete the file' },
      },
      surfaces: {
        confirm: {
          isolated: true,
          actions: {
            cancel: { keys: [shortcut('Escape')], description: 'Keep it' },
          },
        },
      },
    },
  },
});

const files = ['notes.md', 'budget.xlsx', 'photo.jpg', 'talk.key'];

function Files() {
  const { surface, openSurface, closeSurface } = keys.useSurface();
  const [at, setAt] = useState(0);
  const [dark, setDark] = useState(false);
  keys.useAction('theme', () => setDark((now) => !now));
  keys.useAction('files.next', () =>
    setAt((now) => Math.min(files.length - 1, now + 1)),
  );
  keys.useAction('files.remove', () => openSurface('files.confirm'));
  keys.useAction('files.confirm.cancel', () => closeSurface('files.confirm'));
  return (
    <main className={dark ? 'dark' : 'light'} id="theme">
      <h1>Files</h1>
      <p>
        <kbd>j</kbd> next file, <kbd>d</kbd> delete, <kbd>t</kbd> switches the
        theme everywhere.
      </p>
      <span className="surface" id="surface">
        Active Surface: {surface ?? 'none'}
      </span>
      <ul>
        {files.map((file, index) => (
          <li key={file} aria-current={index === at}>
            {file}
          </li>
        ))}
      </ul>
      {surface === 'files.confirm' ? (
        <div className="backdrop">
          <div className="dialog" id="dialog">
            <h2>Delete {files[at]}?</h2>
            <p>
              <kbd>Esc</kbd> keeps it. The list behind is cut off.
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function App() {
  const [surface, setSurface] = useState<'files' | 'files.confirm' | null>(
    'files',
  );
  return (
    <keys.Provider surface={surface} onSurfaceChange={setSurface}>
      <style>{css}</style>
      <Files />
    </keys.Provider>
  );
}

export default Proof.browser({
  title:
    'An isolated dialog cuts off the list behind it but keeps the app-wide keys',
  description:
    'While the delete dialog is Active, j does not move the list behind it; the global t still switches the theme. Escape closes the dialog and j works again.',
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
        'the files are Active, light, with notes.md selected',
        (yield* tab.text('#surface')) === 'Active Surface: files' &&
          (yield* tab.text('li[aria-current="true"]')) === 'notes.md',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      const read = Effect.all({
        surface: tab.text('#surface'),
        file: tab.text('li[aria-current="true"]'),
        dark: tab.evaluate(() =>
          document.getElementById('theme')!.classList.contains('dark'),
        ),
      });
      yield* tab.press('Open the delete dialog with d', 'd');
      yield* tab.press('Press j behind the dialog', 'j', 'j');
      yield* tab.press('Switch the theme with t', 't');
      const inDialog = yield* read;
      yield* tab.press('Close the dialog with Escape', 'Escape');
      yield* tab.press('Press j in the list', 'j');
      return { inDialog, after: yield* read };
    }),
  verify: ({ inDialog, after }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the dialog was the Active Surface',
        inDialog.surface === 'Active Surface: files.confirm',
      );
      yield* Proof.assert(
        'j did not move the list behind the dialog',
        inDialog.file === 'notes.md',
      );
      yield* Proof.assert('the global t switched the theme', inDialog.dark);
      yield* Proof.assert(
        'after Escape, the list was Active again and j moved it',
        after.surface === 'Active Surface: files' &&
          after.file === 'budget.xlsx',
      );
    }),
});
