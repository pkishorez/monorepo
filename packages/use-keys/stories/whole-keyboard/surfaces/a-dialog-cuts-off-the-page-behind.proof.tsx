import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { createKeys } from '@kestack/use-keys/surfaces';

const keys = createKeys({
  app: {
    actions: { theme: { keys: 't', label: 'Switch light and dark' } },
    surfaces: {
      files: {
        initial: true,
        actions: {
          next: { keys: 'j', label: 'Next file' },
          delete: { keys: 'd', label: 'Delete the file', enters: 'confirm' },
        },
      },
      confirm: { isolated: true },
    },
  },
});

const css = `
  body { margin: 0; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; transition: background 200ms; }
  body:has(.dark) { background: #27272a; }
  body:has(.light) { background: #f4f4f5; }
  main { position: relative; max-width: 720px; margin: 40px auto; padding: 24px; border-radius: 20px; outline: none; }
  main.dark { background: #18181b; color: #fafafa; }
  main.dark p { color: #a1a1aa; }
  main.dark ul { background: #27272a; border-color: #3f3f46; }
  main.dark li[aria-current="true"] { background: #fafafa; color: #18181b; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .surface { display: inline-block; margin-bottom: 14px; padding: 6px 16px; border-radius: 999px; background: #2563eb; color: #fff; font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 8px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; outline: none; }
  li { padding: 10px 16px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
  .backdrop { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(24,24,27,0.45); border-radius: 20px; }
  .dialog { width: 380px; padding: 22px 24px; background: #fff; color: #18181b; border-radius: 16px; box-shadow: 0 30px 60px rgba(0,0,0,0.3); outline: none; }
  .dialog h2 { margin: 0 0 8px; font-size: 22px; }
  .dialog p { margin: 0; }
`;

const files = ['notes.md', 'budget.xlsx', 'photo.jpg', 'talk.key'];

function Confirm(props: { readonly file: string }) {
  // Drawn while the dialog's Surface is Active; Escape leaves it.
  if (!keys.useSurface('confirm').active) return null;
  return (
    <div className="backdrop">
      <keys.Surface id="confirm" className="dialog" asChild>
        <div id="dialog">
          <h2>Delete {props.file}?</h2>
          <p>
            <kbd>Esc</kbd> keeps it. The page behind is cut off.
          </p>
        </div>
      </keys.Surface>
    </div>
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

function Files() {
  const [at, setAt] = useState(0);
  const [dark, setDark] = useState(false);
  keys.useAction('app.theme', () => setDark((now) => !now));
  keys.useAction('files.next', () =>
    setAt((now) => Math.min(files.length - 1, now + 1)),
  );
  return (
    <keys.Surface id="app" asChild>
      <main className={dark ? 'dark' : 'light'} id="theme">
        <h1>Files</h1>
        <p>
          <kbd>j</kbd> next file, <kbd>d</kbd> delete; the app around the list
          switches the theme with <kbd>t</kbd>.
        </p>
        <Status />
        <keys.Surface id="files" asChild>
          <ul>
            {files.map((file, index) => (
              <li key={file} aria-current={index === at}>
                {file}
              </li>
            ))}
          </ul>
        </keys.Surface>
        <Confirm file={files[at]!} />
      </main>
    </keys.Surface>
  );
}

function App() {
  return (
    <keys.Provider vim>
      <style>{css}</style>
      <Files />
    </keys.Provider>
  );
}

export default Proof.browser({
  title:
    'An isolated dialog cuts off everything behind it, the Surfaces around it included',
  description:
    'd enters the delete dialog, which is drawn while its Surface is Active. While it is, j does not move the list and t, bound on the app around it, does not switch the theme: no key climbs out of an isolated Surface. Escape leaves it, which closes it, and the keys behind work again.',
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
        dialogs: tab.count('#dialog'),
        dark: tab.evaluate(() =>
          document.getElementById('theme')!.classList.contains('dark'),
        ),
      });
      yield* tab.press('Open the delete dialog with d', 'd');
      yield* tab.press('Press j behind the dialog', 'j', 'j');
      yield* tab.press('Press t for the theme', 't');
      const inDialog = yield* read;
      yield* tab.press('Close the dialog with Escape', 'Escape');
      yield* tab.press('Press j in the list, then t', 'j', 't');
      return { inDialog, after: yield* read };
    }),
  verify: ({ inDialog, after }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the dialog was the Active Surface',
        inDialog.surface === 'Active Surface: confirm' &&
          inDialog.dialogs === 1,
      );
      yield* Proof.assert(
        'j did not move the list behind the dialog',
        inDialog.file === 'notes.md',
      );
      yield* Proof.assert(
        't, bound on the app around the dialog, did nothing',
        !inDialog.dark,
      );
      yield* Proof.assert(
        'Escape closed the dialog and went back to the list',
        after.dialogs === 0 && after.surface === 'Active Surface: files',
      );
      yield* Proof.assert(
        'behind it again, j moved the list and t switched the theme',
        after.file === 'budget.xlsx' && after.dark,
      );
    }),
});
