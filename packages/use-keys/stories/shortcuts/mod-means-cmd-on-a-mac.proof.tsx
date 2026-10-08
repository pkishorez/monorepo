import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider } from '@kstackz/use-keys';
import { useShortcut } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 720px; margin: 56px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 24px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .status { display: inline-block; padding: 10px 20px; border-radius: 999px; background: #e4e4e7; color: #3f3f46; font-weight: 600; font-size: 20px; }
  .palette { margin-top: 24px; padding: 20px 24px; background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.12); font-size: 20px; }
`;

function App() {
  const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const [open, setOpen] = useState(false);
  useShortcut('mod+k', () => setOpen(true));
  return (
    <main>
      <h1>Docs</h1>
      <p>
        <kbd>mod</kbd> <kbd>k</kbd> opens the command palette. On this{' '}
        {mac ? 'Mac' : 'computer'}, mod is <kbd>{mac ? '⌘' : 'Ctrl'}</kbd>.
      </p>
      <span className="status" id="palette">
        {open ? 'Command palette open' : 'Command palette closed'}
      </span>
      {open ? <div className="palette">Search commands…</div> : null}
    </main>
  );
}

export default Proof.browser({
  title: 'mod means ⌘ on a Mac and Ctrl everywhere else',
  description:
    "`mod+k` follows the platform: the other modifier with K does nothing. The keys pressed below follow the browser's platform.",
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider>
        <style>{css}</style>
        <App />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      const mac = yield* tab.evaluate(() =>
        /Mac|iPhone|iPad|iPod/.test(navigator.platform),
      );
      yield* Proof.assert(
        'the palette starts closed',
        (yield* tab.text('#palette')) === 'Command palette closed',
      );
      return { tab, mac };
    }),
  act: ({ tab, mac }) =>
    Effect.gen(function* () {
      const [mod, other] = mac ? ['Meta', 'Control'] : ['Control', 'Meta'];
      yield* tab.press(
        `Press ${other}+K, the other platform's mod`,
        `${other}+k`,
      );
      const afterOther = yield* tab.text('#palette');
      yield* tab.press(`Press ${mod}+K, this platform's mod`, `${mod}+k`);
      const afterMod = yield* tab.text('#palette');
      return { platform: mac ? 'mac' : 'other', afterOther, afterMod };
    }),
  verify: ({ afterOther, afterMod }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        "the other platform's modifier left the palette closed",
        afterOther === 'Command palette closed',
      );
      yield* Proof.assert(
        "this platform's mod opened the palette",
        afterMod === 'Command palette open',
      );
    }),
});
