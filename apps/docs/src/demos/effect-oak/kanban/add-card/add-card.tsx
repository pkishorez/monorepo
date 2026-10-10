import { Context, Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Input } from '@kstackz/web-platform/components/input';

/*
 * The "+ Add card" control at the foot of one column: Closed, or Open with
 * the title being typed. Submitting hands the title to whoever Provides
 * Adding, a Request, and closes. One Actor per column, made by a factory
 * that bakes the column's id in, since a Child cannot be given it.
 */

/** Whoever takes new cards: the board. */
export class Adding extends Context.Service<
  Adding,
  { readonly add: (columnId: string, title: string) => Effect.Effect<void> }
>()('docs/kanban/Adding') {}

export const makeAddCard = (columnId: string) => {
  const AddCard = Actor.make(`AddCard(${columnId})`, {
    requires: { adding: Adding },
    state: Schema.TaggedUnion({
      Closed: {},
      Open: { title: Schema.String },
    }),
    message: Schema.TaggedUnion({
      ClickedAddCard: {},
      ChangedTitle: { value: Schema.String },
      Submitted: {},
      Cancelled: {},
    }),
  }).build({
    init: () => ({ state: { _tag: 'Closed' } }),
    update: {
      Closed: {
        ClickedAddCard: () => ({ state: { _tag: 'Open', title: '' } }),
      },
      Open: {
        ChangedTitle: ({ value }) => ({
          state: { _tag: 'Open', title: value },
        }),
        Submitted: (_, { state }) => {
          const title = state.title.trim();
          if (title === '') return {};
          return {
            state: { _tag: 'Closed' },
            command: Effect.gen(function* () {
              yield* (yield* Adding).add(columnId, title);
            }),
          };
        },
        Cancelled: () => ({ state: { _tag: 'Closed' } }),
      },
    },
  });

  const AddCardView = View.make(AddCard, {
    Closed: ({ send }) => (
      <button
        type="button"
        className="w-full rounded-lg border border-dashed p-2 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => send({ _tag: 'ClickedAddCard' })}
      >
        + Add card
      </button>
    ),
    Open: ({ state, send }) => (
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send({ _tag: 'Submitted' });
        }}
      >
        <Input
          autoFocus
          aria-label="New card title"
          placeholder="Card title…"
          value={state.title}
          onChange={(event) =>
            send({ _tag: 'ChangedTitle', value: event.target.value })
          }
          onKeyDown={(event) =>
            event.key === 'Escape' && send({ _tag: 'Cancelled' })
          }
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => send({ _tag: 'Cancelled' })}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Add
          </Button>
        </div>
      </form>
    ),
  });

  return { AddCard, AddCardView };
};
