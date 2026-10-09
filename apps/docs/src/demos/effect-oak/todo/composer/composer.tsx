import { Context, Effect, Schema } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Input } from '@kstackz/web-platform/components/input';

/*
 * The field a new todo is typed into. It keeps its own text and, on submit,
 * asks whoever Provides Composing to add it: a Request, so it never needs to
 * know where the list is.
 */

/** Whoever takes new todos from a Composer. */
export class Composing extends Context.Service<
  Composing,
  { readonly add: (text: string) => void }
>()('docs/todo/Composing') {}

export const Composer = Node.make('Composer', {
  requires: { composing: Composing },
  model: Schema.Struct({ text: Schema.String }),
  message: Schema.TaggedUnion({
    Typed: { text: Schema.String },
    Submitted: {},
  }),
}).build({
  init: () => ({ model: { text: '' } }),
  update: {
    Typed: ({ text }) => ({ model: { text } }),
    Submitted: (_, { model }) => {
      const text = model.text.trim();
      if (text === '') return {};
      return {
        model: { text: '' },
        commands: [
          Effect.gen(function* () {
            (yield* Composing).add(text);
          }),
        ],
      };
    },
  },
});

export const ComposerView = View.make(Composer, ({ model, send }) => (
  <form
    className="flex gap-2"
    onSubmit={(event) => {
      event.preventDefault();
      send({ _tag: 'Submitted' });
    }}
  >
    <Input
      aria-label="New todo"
      placeholder="What needs to be done?"
      value={model.text}
      onChange={(event) => send({ _tag: 'Typed', text: event.target.value })}
    />
    <Button type="submit">Add</Button>
  </form>
));
