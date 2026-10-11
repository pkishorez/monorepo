import { Schema } from 'effect';
import { Actor } from 'effect-oak';

/**
 * An Actor with States: a Door that is Closed, Open, or Locked with a code
 * that only exists while Locked. Update is written per State, so a Message
 * with no rule in the current State is ignored.
 */
export const Door = Actor.make('Door', {
  state: Schema.TaggedUnion({
    Closed: {},
    Open: {},
    Locked: { code: Schema.String },
  }),
  message: Schema.TaggedUnion({
    Toggle: {},
    Lock: { code: Schema.String },
    Unlock: { code: Schema.String },
  }),
}).build({
  init: () => ({ state: { _tag: 'Closed' } }),
  update: {
    Closed: {
      Toggle: () => ({ state: { _tag: 'Open' } }),
      Lock: ({ code }) => ({ state: { _tag: 'Locked', code } }),
    },
    Open: {
      Toggle: () => ({ state: { _tag: 'Closed' } }),
    },
    Locked: {
      // The right code is a Transition; a wrong one is handled with no Change.
      Unlock: ({ code }, { state }) =>
        code === state.code ? { state: { _tag: 'Closed' } } : {},
    },
  },
});
