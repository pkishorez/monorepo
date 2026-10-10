import { Context, Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Input } from '@kstackz/web-platform/components/input';

/*
 * The field a chat message is typed into. On submit it clears and sends the
 * text through whoever Provides Conversation; it never learns whether the send
 * worked, the chat does.
 */

/** A chat that is online, as the Actors inside it see it. */
export class Conversation extends Context.Service<
  Conversation,
  { readonly send: (text: string) => Effect.Effect<void> }
>()('docs/websocket-chat/Conversation') {}

export const Composer = Actor.make('Composer', {
  requires: { conversation: Conversation },
  model: Schema.Struct({ text: Schema.String }),
  message: Schema.TaggedUnion({
    UpdatedMessageInput: { value: Schema.String },
    SubmittedMessage: {},
  }),
}).build({
  init: () => ({ model: { text: '' } }),
  update: {
    UpdatedMessageInput: ({ value }) => ({ model: { text: value } }),
    SubmittedMessage: (_, { model }) => {
      const text = model.text.trim();
      if (text === '') return {};
      return {
        model: { text: '' },
        command: Effect.gen(function* () {
          yield* (yield* Conversation).send(text);
        }),
      };
    },
  },
});

export const ComposerView = View.make(Composer, ({ model, send }) => (
  <form
    className="flex gap-2"
    onSubmit={(event) => {
      event.preventDefault();
      send({ _tag: 'SubmittedMessage' });
    }}
  >
    <Input
      aria-label="Message"
      placeholder="Type a message…"
      value={model.text}
      onChange={(event) =>
        send({ _tag: 'UpdatedMessageInput', value: event.target.value })
      }
    />
    <Button type="submit" disabled={model.text.trim() === ''}>
      Send
    </Button>
  </form>
));
