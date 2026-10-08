import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider, useKeys, useKeysState } from '@kstackz/use-keys';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 760px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .board { display: grid; place-items: center; height: 260px; margin-bottom: 16px; border-radius: 16px; background: #fff radial-gradient(#d4d4d8 1.5px, transparent 1.5px) 0 0 / 24px 24px; border: 2px solid #e4e4e7; font-size: 22px; font-weight: 600; color: #71717a; }
  .board.panning { border-color: #2563eb; color: #2563eb; cursor: grab; }
  .panel { display: flex; gap: 16px; }
  .panel div { flex: 1; padding: 12px 16px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  .panel b { display: block; margin-top: 4px; font: 600 18px Menlo, Consolas, monospace; }
`;

function Board() {
  const [panning, setPanning] = useState(false);
  const [last, setLast] = useState('none yet');
  const { keysRef, active } = useKeys({
    onKey: () =>
      setPanning(
        keysRef.current.some(
          (key) => key.name === 'Space' && key.upAt === null,
        ),
      ),
    onEnd: (keys, end) => {
      setPanning(false);
      setLast(
        `${keys.map((key) => key.name).join(' ')}${end.interrupted ? ', interrupted' : ''}`,
      );
    },
  });
  const keys = useKeysState(keysRef);
  return (
    <main>
      <h1>Whiteboard</h1>
      <p>
        Hold <kbd>Space</kbd> to pan. <code>useKeys</code> watches every key
        without taking any.
      </p>
      <div className={panning ? 'board panning' : 'board'} id="board">
        {panning ? 'Panning: drag to move the board' : 'Drawing'}
      </div>
      <div className="panel">
        <div>
          Keys right now{' '}
          <b id="now">{active ? keys.map((key) => key.name).join(' ') : '–'}</b>
        </div>
        <div>
          Last keys <b id="last">{last}</b>
        </div>
      </div>
    </main>
  );
}

type Keyboard = {
  readonly keyboard: {
    readonly down: (key: string) => Promise<void>;
    readonly up: (key: string) => Promise<void>;
  };
};

export default Proof.browser({
  title:
    'Holding Space pans the board, and letting go reports every key that was held',
  description:
    '`useKeys` reports every Key from the first going down until the last lifts. The board pans while Space is down, `useKeysState` shows the keys live, and `onEnd` reports them once they all lift.',
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider>
        <style>{css}</style>
        <Board />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'the board is drawing',
        (yield* tab.text('#board')) === 'Drawing',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.raw('Hold Space down', async (page) => {
        await (page as Keyboard).keyboard.down('Space');
        await new Promise((resolve) => setTimeout(resolve, 600));
      });
      const holding = {
        board: yield* tab.text('#board'),
        now: yield* tab.text('#now'),
      };
      yield* tab.raw('Let go of Space', async (page) => {
        await (page as Keyboard).keyboard.up('Space');
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      const released = {
        board: yield* tab.text('#board'),
        last: yield* tab.text('#last'),
      };
      yield* tab.press('Press Shift+A', 'Shift+A');
      return { holding, released, chord: yield* tab.text('#last') };
    }),
  verify: ({ holding, released, chord }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'while Space was down the board was panning and showed Space',
        holding.board.startsWith('Panning') && holding.now === 'Space',
      );
      yield* Proof.assert(
        'letting go ended panning and reported the Keys',
        released.board === 'Drawing' && released.last === 'Space',
      );
      yield* Proof.assert(
        'Shift+A was reported as two Keys, the letter lowercase',
        chord === 'Shift a',
      );
    }),
});
