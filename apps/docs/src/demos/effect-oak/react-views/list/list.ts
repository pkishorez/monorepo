import { Schema } from 'effect';
import { Actor } from 'effect-oak';

/** One row: its own text and how often it was bumped. */
export const Row = Actor.make('Row', {
  input: Schema.Struct({ text: Schema.String }),
  model: Schema.Struct({ text: Schema.String, bumps: Schema.Number }),
  message: Schema.TaggedUnion({ ClickedBump: {} }),
}).build({
  init: ({ text }) => ({ model: { text, bumps: 0 } }),
  update: {
    ClickedBump: (_, { model }) => ({
      model: { ...model, bumps: model.bumps + 1 },
    }),
  },
});

/** A title that only the List draws, with a click count of its own. */
export const Header = Actor.make('Header', {
  model: Schema.Struct({ clicks: Schema.Number }),
  message: Schema.TaggedUnion({ Clicked: {} }),
}).build({
  init: () => ({ model: { clicks: 0 } }),
  update: {
    Clicked: (_, { model }) => ({ model: { clicks: model.clicks + 1 } }),
  },
});

/** A fixed Child, a keyed Child per id, and the selected id. */
export const List = Actor.make('List', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    next: Schema.Number,
    selected: Schema.String,
    title: Schema.String,
  }),
  message: Schema.TaggedUnion({
    ClickedAdd: {},
    ClickedRemove: { id: Schema.String },
    ClickedSelect: { id: Schema.String },
    ClickedRename: {},
  }),
  children: { header: Header, rows: Actor.many(Row) },
}).build({
  init: () => ({
    model: { ids: ['a', 'b', 'c'], next: 0, selected: 'a', title: 'List 1' },
  }),
  invoke: ({ model }) => ({
    rows: model.ids.map((id) => ({ key: id, input: { text: id } })),
  }),
  update: {
    ClickedAdd: (_, { model }) => ({
      model: {
        ...model,
        ids: [...model.ids, `n${model.next}`],
        next: model.next + 1,
      },
    }),
    ClickedRemove: ({ id }, { model }) => ({
      model: { ...model, ids: model.ids.filter((kept) => kept !== id) },
    }),
    ClickedSelect: ({ id }, { model }) => ({
      model: { ...model, selected: id },
    }),
    ClickedRename: (_, { model }) => ({
      model: { ...model, title: `List ${model.title.length}` },
    }),
  },
});
