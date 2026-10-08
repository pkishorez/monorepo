import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider } from '@kstackz/use-keys';
import { useSequence } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 720px; margin: 56px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 20px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .status { display: inline-block; margin-bottom: 20px; padding: 10px 20px; border-radius: 999px; background: #e4e4e7; color: #3f3f46; font-weight: 600; font-size: 20px; }
  .status.done { background: #16a34a; color: #fff; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; margin: 0 0 8px; }
  ol { margin: 0; padding: 8px 8px 8px 44px; min-height: 60px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  ol li { padding: 8px; font-weight: 600; }
  .empty { color: #a1a1aa; font-weight: 400; list-style: none; margin-left: -28px; }
`;

const reasons = {
  key: 'a wrong key',
  late: 'too slow',
  interrupted: 'the page lost focus',
} as const;

function Editor() {
  const [saved, setSaved] = useState(false);
  const [cancels, setCancels] = useState<ReadonlyArray<string>>([]);
  useSequence('z z', () => setSaved(true), {
    onCancel: (reason) =>
      setCancels((now) => [...now, `Cancelled: ${reasons[reason]}`]),
  });
  return (
    <main>
      <h1>draft.txt</h1>
      <p>
        <kbd>z</kbd> <kbd>z</kbd> saves and quits, if the second <kbd>z</kbd>{' '}
        comes within half a second
      </p>
      <span className={saved ? 'status done' : 'status'} id="saved">
        {saved ? 'Saved and quit' : 'Unsaved changes'}
      </span>
      <h2>Sequence log</h2>
      <ol>
        {cancels.length === 0 ? (
          <li className="empty">Nothing yet</li>
        ) : (
          cancels.map((line, index) => (
            <li key={index} className="cancel">
              {line}
            </li>
          ))
        )}
      </ol>
    </main>
  );
}

export default Proof.browser({
  title:
    'A second key that comes too late cancels the Sequence instead of running it',
  description:
    'The provider waits 500 ms for each step. A second z almost a second later does not save; the Sequence Cancels as too slow.',
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider sequence={{ timeout: 500 }}>
        <style>{css}</style>
        <Editor />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'the draft is unsaved',
        (yield* tab.text('#saved')) === 'Unsaved changes',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.press('Press z', 'z');
      yield* tab.press('Press z again, almost a second later', 'z');
      return {
        saved: yield* tab.text('#saved'),
        log: yield* tab.evaluate(() =>
          [...document.querySelectorAll('li.cancel')].map(
            (item) => item.textContent,
          ),
        ),
      };
    }),
  verify: ({ saved, log }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the draft was not saved',
        saved === 'Unsaved changes',
      );
      yield* Proof.assert(
        'the Sequence Cancelled as too slow',
        log.length > 0 && log.every((line) => line === 'Cancelled: too slow'),
      );
    }),
});
