import { Schema } from 'effect';
import { Actor } from 'effect-oak';

/** A card that counts its own bumps. */
export const Card = Actor.make('Card', {
  input: Schema.Struct({ label: Schema.String }),
  model: Schema.Struct({ label: Schema.String, bumps: Schema.Number }),
  message: Schema.TaggedUnion({ ClickedBump: {} }),
}).build({
  init: ({ label }) => ({ model: { label, bumps: 0 } }),
  update: {
    ClickedBump: (_, { model }) => ({
      model: { ...model, bumps: model.bumps + 1 },
    }),
  },
});

/** Cards in an order, one selected, and a title only the Deck draws. */
export const Deck = Actor.make('Deck', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    next: Schema.Number,
    selected: Schema.String,
    title: Schema.Number,
  }),
  message: Schema.TaggedUnion({
    ClickedAdd: {},
    ClickedRemove: { id: Schema.String },
    ClickedShuffle: {},
    ClickedSelect: { id: Schema.String },
    ClickedRename: {},
  }),
  children: { cards: Actor.many(Card) },
}).build({
  init: () => ({
    model: { ids: ['A', 'B', 'C'], next: 0, selected: 'A', title: 1 },
  }),
  invoke: ({ model }) => ({
    cards: model.ids.map((id) => ({ key: id, input: { label: id } })),
  }),
  update: {
    ClickedAdd: (_, { model }) => ({
      model: {
        ...model,
        ids: [...model.ids, `${model.next}`],
        next: model.next + 1,
      },
    }),
    ClickedRemove: ({ id }, { model }) => ({
      model: { ...model, ids: model.ids.filter((kept) => kept !== id) },
    }),
    ClickedShuffle: (_, { model }) => ({
      model: {
        ...model,
        ids: [...model.ids.slice(1), ...model.ids.slice(0, 1)],
      },
    }),
    ClickedSelect: ({ id }, { model }) => ({
      model: { ...model, selected: id },
    }),
    ClickedRename: (_, { model }) => ({
      model: { ...model, title: model.title + 1 },
    }),
  },
});
