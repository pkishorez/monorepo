import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';

/** A draft that is saved for a second, then shown as saved. */
export const Editor = Actor.make('Editor', {
  model: Schema.Struct({ draft: Schema.String }),
  state: Schema.TaggedUnion({
    Editing: {},
    Saving: { since: Schema.Number },
    Saved: {},
  }),
  message: Schema.TaggedUnion({
    Typed: { text: Schema.String },
    Submitted: {},
    Finished: {},
  }),
}).build({
  init: () => ({ model: { draft: '' }, state: { _tag: 'Editing' } }),
  update: {
    '*': {
      Typed: ({ text }) => ({
        model: { draft: text },
        state: { _tag: 'Editing' },
      }),
    },
    Editing: {
      Submitted: (_, { at }) => ({
        state: { _tag: 'Saving', since: at },
        command: Effect.sleep('1 second').pipe(
          Effect.as({ _tag: 'Finished' as const }),
        ),
      }),
    },
    Saving: { Finished: () => ({ state: { _tag: 'Saved' } }) },
  },
});

/** The same Actor twice, so two Views can draw one each. */
export const Editors = Actor.make('Editors', {
  children: { kept: Editor, remounted: Editor },
}).build({});
