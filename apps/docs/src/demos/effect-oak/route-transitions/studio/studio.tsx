import { Context, Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Textarea } from '@kstackz/web-platform/components/textarea';

/*
 * The Studio page's editor. It is a Child of the root's Studio State, so it
 * is destroyed the moment the Studio is left, along with its Model. Saving
 * the draft on the way out is the root's job (its Update sees the Studio
 * being left), but the root cannot read a Child's Model and there are no exit
 * actions. So every edit is also reported up through the Drafts Request,
 * and the root keeps its own copy to save.
 */

/** Provided by the root while in the Studio: where edits are reported. */
export class Drafts extends Context.Service<
  Drafts,
  { readonly edited: (text: string) => Effect.Effect<void> }
>()('docs/route-transitions/Drafts') {}

export const Studio = Actor.make('Studio', {
  requires: { drafts: Drafts },
  model: Schema.Struct({ text: Schema.String }),
  message: Schema.TaggedUnion({ Edited: { text: Schema.String } }),
}).build({
  init: () => ({ model: { text: '' } }),
  update: {
    Edited: ({ text }) => ({
      model: { text },
      command: Effect.gen(function* () {
        yield* (yield* Drafts).edited(text);
      }),
    }),
  },
});

export const StudioView = View.make(Studio, ({ model, send }) => (
  <Textarea
    aria-label="Draft"
    className="h-40"
    placeholder="A half-finished thought…"
    value={model.text}
    onChange={(event) => send({ _tag: 'Edited', text: event.target.value })}
  />
));
