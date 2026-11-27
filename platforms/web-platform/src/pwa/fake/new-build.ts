import { Schema, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import { outdatedOver } from './layer.ts';

/*
 * The New build fake: the builds of an app that a deploy puts out, as one
 * page sees them through its PWA. Its state is whether a build newer than
 * the page's is out; it starts with none, the page the newest build. Its
 * control puts a newer build out. layer.ts answers an app asking to move
 * to its newest build, as `updateToNewest` does.
 */

export const NewBuildState = Schema.Struct({
  /** A build newer than the page's is out. */
  newer: Schema.Boolean,
});
export type NewBuildState = typeof NewBuildState.Type;

/** The New build fake. Its Layer gives std-toolkit's `OnOutdated`. */
export const newBuild = Fake.make({
  name: 'newBuild',
  state: NewBuildState,
  initial: { newer: false },
  controls: {
    PutOutNewerBuild: Fake.control(
      NewBuildState,
      Schema.Struct({}).annotate({
        description: "A deploy puts out a build newer than the page's.",
      }),
      (_, state) => SubscriptionRef.set(state, { newer: true }),
    ),
  },
  layer: outdatedOver,
});
