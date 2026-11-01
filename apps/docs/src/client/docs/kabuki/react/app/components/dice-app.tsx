import { Effect, Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { DiceLive, Random } from './dice.ts';

/** Where the pips sit on a 3 × 3 grid, for each face. */
const PIPS: Record<number, ReadonlyArray<number>> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ face, small = false }: { face: number; small?: boolean }) {
  return (
    <span
      aria-label={`${face}`}
      className={`grid grid-cols-3 grid-rows-3 rounded-lg border border-border bg-background shadow-xs ${small ? 'size-7 p-1' : 'size-16 p-2.5'}`}
    >
      {Array.from({ length: 9 }, (_, at) => (
        <span
          key={at}
          className={`m-auto rounded-full ${small ? 'size-1' : 'size-2.5'} ${PIPS[face]?.includes(at) ? 'bg-foreground' : ''}`}
        />
      ))}
    </span>
  );
}

const DiceView = View.make(DiceLive, ({ _tag, model, send, root }) => {
  const [newest, ...before] = model.faces;
  return (
    <div {...root} className="flex flex-col items-center gap-4">
      {newest === undefined ? (
        <span className="grid size-16 place-items-center rounded-lg border border-dashed border-border text-muted-foreground">
          ?
        </span>
      ) : (
        <Die face={newest} />
      )}
      <div className="flex h-7 gap-1.5 opacity-60">
        {before.map((face, at) => (
          <Die key={at} face={face} small />
        ))}
      </div>
      {_tag === 'Rolling' ? (
        <Button variant="outline" onClick={() => send({ _tag: 'Held' })}>
          Hold
        </Button>
      ) : (
        <Button onClick={() => send({ _tag: 'Started' })}>Roll</Button>
      )}
    </div>
  );
});

// The Dice Requires Random, so the App must give it. Leave the layer out,
// and this line does not compile. A test would give a Random that always
// lands on 6.
const RandomLive = Layer.succeed(Random, {
  face: Effect.sync(() => 1 + Math.floor(Math.random() * 6)),
});

export const DiceApp = View.app(DiceView, {
  layer: RandomLive,
  name: 'docs:app',
});

// Not part of the app: it reads the running app from beside it.
function RuntimeBar() {
  const runtime = DiceApp.useRuntime();
  const { branch, shown, running } = runtime;
  const step =
    shown === null
      ? branch.length
      : shown === 'init'
        ? 0
        : branch.findIndex((entry) => entry.id === shown) + 1;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-1.5">
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {shown === null
          ? `Step ${step}, ${running ? 'live' : 'stopped'}`
          : `Step ${step} of ${branch.length}, read only`}
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => (running ? runtime.stop() : runtime.start())}
      >
        {running ? 'Stop' : 'Start'}
      </Button>
    </div>
  );
}

function DicePage() {
  return (
    <div className="flex flex-col items-center gap-6">
      <DiceApp />
      <RuntimeBar />
    </div>
  );
}

// What the window on this page shows: the app and the bar. Its Devtools
// read the same Runtime.
export const DiceWindow = Object.assign(DicePage, {
  useRuntime: DiceApp.useRuntime,
});
