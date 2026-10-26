import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { LiveLive } from '../live/actor.ts';
import { StoryLive } from '../story/actor.ts';

/*
 * The tool's root: which mode is shown, and both modes as Children, each
 * kept the whole time, so switching back finds one where it was left.
 */

export const Devtools = Actor.define('Devtools', {
  model: Schema.Struct({ mode: Schema.Literals(['live', 'story']) }),
  message: Schema.TaggedUnion({
    Switched: { mode: Schema.Literals(['live', 'story']) },
  }),
});

export const DevtoolsLive = Actor.build(Devtools, {
  init: () => ({ model: { mode: 'live' } }),
  children: {
    live: { actor: LiveLive },
    story: { actor: StoryLive },
  },
  on: {
    Switched: ({ mode }) => ({ model: { mode } }),
  },
});
