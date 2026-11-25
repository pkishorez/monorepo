import type { Runtime, Snapshot } from '@kestack/kabuki';
// Named in the declarations of the Actor this file exports.
import type {} from '@kestack/kabuki/types';
import { NEW_BUILD_CONTROLS, NewBuildFake } from './actor.ts';
import { newBuildOver } from './serve.ts';

/*
 * `@kestack/web-platform/pwa/fake`: the New build fake, the builds a deploy
 * puts out as one page's PWA sees them, as a Fake the Fake World runs. Its
 * Actor starts blank, the page the newest build; its Control puts a newer
 * build out. `serve` gives std-toolkit's `OnOutdated`, what an app runs when it
 * finds it is older than what it talks to, in place of `updateToNewest`;
 * `newBuildOver(runtime, options)` takes another reload or notice.
 *
 * `kept` is the Snapshot a reload keeps: no ask waiting, as the page that
 * asked is gone. Moving ends with no newer build out, so the page a move
 * reloads into is the newest, and an app that moved never moves again
 * for the same build.
 */

const kept = (
  snapshot: Snapshot<typeof NewBuildFake>,
): Snapshot<typeof NewBuildFake> => ({
  ...snapshot,
  root: {
    ...snapshot.root,
    model: { ...snapshot.root.model, waiting: false },
  },
});

export const newBuild = {
  name: 'New build',
  actor: NewBuildFake,
  controls: NEW_BUILD_CONTROLS,
  serve: (runtime: Runtime<typeof NewBuildFake>) => newBuildOver(runtime),
  kept,
};

export {
  blank,
  NEW_BUILD_CONTROLS,
  NewBuildFake,
  type NewBuildMessage,
  type NewBuildModel,
} from './actor.ts';
export {
  MOVING,
  newBuildOver,
  RELOAD_AFTER,
  type NewBuildOptions,
} from './serve.ts';
