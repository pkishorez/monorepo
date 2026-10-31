// Keys the whole window listens for, and the game's key lock, set and
// let go with the recording.
// eslint-disable-next-line no-restricted-imports
import { useEffect, useState } from 'react';
import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { HistoryIcon } from 'lucide-react';
import {
  Timeline,
  carryOn,
  showStep,
  stepOf,
} from '../../../../../components/index.ts';
import { Seed } from '../app/capabilities/seed.ts';
import { BrowserKeyboard, keyLock } from '../app/browser/keyboard.ts';
import { COLORS } from '../app/drawing/snake.tsx';
import { StageLive } from '../app/stage/stage.ts';
import { StageView } from '../app/stage/stage-view.tsx';
import { Caption, cuesOf } from './caption.tsx';
import { Tree } from './tree.tsx';

/*
 * Snake, staged to be recorded as a square video: exactly 1080 by 1080,
 * in the site's theme. A caption across the top, the game on the left
 * with its Actor tree beside it, and the Timeline along the bottom. The
 * URL sets the take: `?seed=` where the food falls, `?script=` the
 * captions. Once the game is over, Rewind 3 seconds goes back and plays
 * on from there, as a new Branch.
 *
 * The keys are locked to the game for as long as the recording is open.
 * Beside them: [ a Step back, ] a Step on, F carries on from the Step
 * shown, L goes live, N the next caption.
 */

const param = (name: string) =>
  new URLSearchParams(window.location.search).get(name);

const Recorded = View.app(StageView, {
  layer: Layer.mergeAll(
    BrowserKeyboard,
    Layer.sync(Seed, () => ({ seed: param('seed') ?? 'kabuki' })),
  ),
  name: 'demo:snake-record',
});

export function SnakeRecord() {
  const runtime = Recorded.useRuntime();
  const [cues] = useState(() => cuesOf(param('script')));
  const [skips, setSkips] = useState(0);
  useKeys(runtime, setSkips);
  // The recording is the whole page: the keys stay locked to the game.
  useEffect(() => {
    keyLock.set(true);
    return () => keyLock.set(false);
  }, []);
  const live = runtime.shown === null;
  const over =
    live && runtime.history.snapshotAt(runtime.head).state._tag === 'Over';
  return (
    <div className="grid h-dvh w-full place-items-center overflow-hidden bg-muted">
      <div
        className={`grid size-[1080px] shrink-0 grid-rows-[96px_minmax(0,1fr)_auto] gap-6 bg-background p-12 text-foreground ${COLORS}`}
      >
        <Caption cues={cues} skips={skips} />
        <div className="grid min-h-0 grid-cols-[auto_minmax(0,1fr)] gap-6">
          <div className="[zoom:1.32]" inert={!live}>
            <Recorded />
          </div>
          <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl bg-muted/50">
            <Tree runtime={runtime} />
            {over && (
              <div className="mt-auto flex items-center justify-between gap-4 p-6">
                <p className="text-sm text-muted-foreground">
                  Go back, and play on as a new Branch.
                </p>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => rewind(runtime, 3000)}
                >
                  <HistoryIcon />
                  Rewind 3 seconds
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border">
          <Timeline runtime={runtime} />
        </div>
      </div>
    </div>
  );
}

/** Goes live from the Step `ms` before the last Message, growing a new Branch. */
const rewind = (runtime: View.AppRuntime, ms: number) => {
  const { branch } = runtime;
  const until = (branch.at(-1)?.at ?? 0) - ms;
  carryOn(runtime, branch.findLastIndex((entry) => entry.at <= until) + 1);
};

function useKeys(
  runtime: View.AppRuntime,
  setSkips: (skip: (n: number) => number) => void,
) {
  const at = stepOf(runtime);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '[') showStep(runtime, at - 1);
      else if (event.key === ']') showStep(runtime, at + 1);
      else if (event.key === 'l') runtime.show(null);
      else if (event.key === 'f' && runtime.shown !== null)
        carryOn(runtime, at);
      else if (event.key === 'n') setSkips((n) => n + 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runtime, at, setSkips]);
}
