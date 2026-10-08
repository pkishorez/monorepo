import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider, useKeys, useKeysState } from '@kstackz/use-keys';
import { useShortcut } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 760px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 20px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .row { display: flex; gap: 16px; margin-bottom: 20px; }
  .card { flex: 1; padding: 16px 20px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  .card b { display: block; font-size: 34px; font-variant-numeric: tabular-nums; }
  .held { display: inline-block; min-width: 120px; padding: 6px 14px; border-radius: 999px; background: #e4e4e7; font-weight: 600; }
  .held.on { background: #2563eb; color: #fff; }
  ul { list-style: none; margin: 0; padding: 6px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; columns: 2; }
  li { padding: 6px 14px; border-radius: 8px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
`;

const rows = Array.from({ length: 16 }, (_, index) => `Row ${index + 1}`);

function HeldKeys() {
  const keys = useKeysState(useKeys().keysRef);
  const down = keys.filter((key) => key.upAt === null).map((key) => key.name);
  return (
    <span className={down.length > 0 ? 'held on' : 'held'} id="held">
      {down.length > 0 ? `Holding ${down.join(' + ')}` : 'No key held'}
    </span>
  );
}

function Sheet() {
  const [at, setAt] = useState(0);
  const [flagged, setFlagged] = useState(0);
  useShortcut('j', () => setAt((now) => Math.min(rows.length - 1, now + 1)), {
    repeat: true,
  });
  useShortcut('f', () => setFlagged((now) => now + 1));
  return (
    <main>
      <h1>Spreadsheet</h1>
      <p>
        Hold <kbd>j</kbd> to keep moving down. <kbd>f</kbd> flags once, however
        long it is held.
      </p>
      <div className="row">
        <div className="card">
          Row selected <b id="row">{at + 1}</b>
        </div>
        <div className="card">
          Times flagged <b id="flagged">{flagged}</b>
        </div>
      </div>
      <p>
        <HeldKeys />
      </p>
      <ul>
        {rows.map((row, index) => (
          <li key={row} aria-current={index === at}>
            {row}
          </li>
        ))}
      </ul>
    </main>
  );
}

type Keyboard = {
  readonly keyboard: {
    readonly down: (key: string) => Promise<void>;
    readonly up: (key: string) => Promise<void>;
  };
};

const hold = (key: string, ms: number) => async (page: unknown) => {
  const { keyboard } = page as Keyboard;
  await keyboard.down(key);
  await new Promise((resolve) => setTimeout(resolve, ms));
  await keyboard.up(key);
};

export default Proof.browser({
  title: 'Holding a key down repeats only the Shortcuts that ask to repeat',
  description:
    'The provider repeats after 300 ms, then every 100 ms. `j` asks to repeat; `f` does not, so it commits once however long it is held.',
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider repeat={{ delay: 300, interval: 100 }}>
        <style>{css}</style>
        <Sheet />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'row 1 is selected and nothing is flagged',
        (yield* tab.text('#row')) === '1' &&
          (yield* tab.text('#flagged')) === '0',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.raw('Hold j for one second', hold('j', 1000));
      const row = Number(yield* tab.text('#row'));
      yield* tab.raw('Hold f for one second', hold('f', 1000));
      const flagged = Number(yield* tab.text('#flagged'));
      return { row, flagged };
    }),
  verify: ({ row, flagged }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `holding j moved down several rows (to row ${row})`,
        row >= 6,
      );
      yield* Proof.assert(
        `holding f flagged exactly once (${flagged})`,
        flagged === 1,
      );
    }),
});
