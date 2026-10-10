import { Effect, Layer, Random, Schema, Stream } from 'effect';
import { Actor } from 'effect-oak';
import { Adding, makeAddCard } from './add-card/index.js';
import { BoardStore } from './board-store/index.js';
import { appendCard, Columns, moveCard, placeOf } from './columns/index.js';
import { follow } from './drag/index.js';

/*
 * A kanban board: Loading → Idle ⇄ Dragging.
 *
 * The columns are the Model, kept in every State. Loading reads the saved
 * board in a Lifetime. Idle has one AddCard Child per column and Provides
 * Adding for them. Dragging is a card being held: its Lifetime follows the
 * pointer and sends a Message only when the drop target changes, so the View
 * can draw the card where it would land. Every change to the columns is saved
 * by a Command.
 */

const todo = makeAddCard('todo');
const inProgress = makeAddCard('in-progress');
const done = makeAddCard('done');

/** Each column's add-card View, by column id. */
export const AddCardViews = {
  todo: todo.AddCardView,
  inProgress: inProgress.AddCardView,
  done: done.AddCardView,
};

const save = (columns: Columns) =>
  Effect.gen(function* () {
    yield* (yield* BoardStore).save(columns);
    return { _tag: 'SucceededSaveBoard' as const };
  }).pipe(Effect.orElseSucceed(() => ({ _tag: 'FailedSaveBoard' as const })));

const IDLE = { _tag: 'Idle' } as const;

export const Board = Actor.make('Board', {
  requires: { store: BoardStore },
  model: Schema.Struct({ columns: Columns }),
  state: Schema.TaggedUnion({
    Loading: {},
    Idle: {},
    Dragging: {
      cardId: Schema.String,
      columnId: Schema.String,
      index: Schema.Number,
    },
  }),
  message: Schema.TaggedUnion({
    Loaded: { columns: Columns },
    RequestedAdd: { columnId: Schema.String, title: Schema.String },
    CompletedGenerateCardId: {
      cardId: Schema.String,
      columnId: Schema.String,
      title: Schema.String,
    },
    PickedUp: { cardId: Schema.String },
    Hovered: { columnId: Schema.String, index: Schema.Number },
    Dropped: {},
    Cancelled: {},
    SucceededSaveBoard: {},
    FailedSaveBoard: {},
  }),
  provides: { Idle: [Adding] },
  children: {
    Idle: {
      todo: todo.AddCard,
      'in-progress': inProgress.AddCard,
      done: done.AddCard,
    },
  },
}).build({
  init: () => ({ model: { columns: [] }, state: { _tag: 'Loading' } }),
  lifetime: {
    Loading: (self) =>
      Effect.gen(function* () {
        const columns = yield* (yield* BoardStore).load;
        yield* self.send({ _tag: 'Loaded', columns });
      }),
    Dragging: (self) =>
      Effect.gen(function* () {
        const { state } = yield* self.get;
        yield* follow(state.cardId).pipe(Stream.runForEach(self.send));
      }),
  },
  provides: {
    Idle: (self) =>
      Layer.succeed(Adding, {
        add: (columnId, title) =>
          self.send({ _tag: 'RequestedAdd', columnId, title }),
      }),
  },
  update: {
    Loading: {
      Loaded: ({ columns }) => ({ model: { columns }, state: IDLE }),
    },
    Idle: {
      RequestedAdd: ({ columnId, title }) => ({
        command: Effect.gen(function* () {
          const id = yield* Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER);
          return {
            _tag: 'CompletedGenerateCardId' as const,
            cardId: `card-${id.toString(36)}`,
            columnId,
            title,
          };
        }),
      }),
      PickedUp: ({ cardId }, { model }) => {
        const place = placeOf(model.columns, cardId);
        return place ? { state: { _tag: 'Dragging', cardId, ...place } } : {};
      },
    },
    Dragging: {
      Hovered: ({ columnId, index }, { state }) => ({
        state: { ...state, columnId, index },
      }),
      Dropped: (_, { model, state }) => {
        const columns = moveCard(
          model.columns,
          state.cardId,
          state.columnId,
          state.index,
        );
        return { model: { columns }, state: IDLE, command: save(columns) };
      },
      Cancelled: () => ({ state: IDLE }),
    },
    '*': {
      CompletedGenerateCardId: ({ cardId, columnId, title }, { model }) => {
        const columns = appendCard(model.columns, columnId, {
          id: cardId,
          title,
          description: '',
        });
        return { model: { columns }, command: save(columns) };
      },
      SucceededSaveBoard: () => ({}),
      FailedSaveBoard: () => ({}),
    },
  },
});

export { BoardStoreLive } from './board-store/index.js';
