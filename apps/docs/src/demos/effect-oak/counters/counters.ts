import { Schema } from 'effect';
import { Actor } from 'effect-oak';
import { CounterMessage, step } from './counter/index.js';

/*
 * A list of counters. Each row is an id and a count; Messages for one
 * counter arrive wrapped with its row's id and are stepped by ./counter.
 */

const Row = Schema.Struct({ id: Schema.String, count: Schema.Number });

export const Counters = Actor.make('Counters', {
  model: Schema.Struct({ rows: Schema.Array(Row), nextRowId: Schema.Number }),
  message: Schema.TaggedUnion({
    ClickedAddRow: {},
    ClickedRemoveRow: { id: Schema.String },
    GotCounterMessage: { id: Schema.String, message: CounterMessage },
  }),
}).build({
  init: () => ({
    model: {
      rows: [0, 1, 2].map((n) => ({ id: `counter-${n}`, count: 0 })),
      nextRowId: 3,
    },
  }),
  update: {
    ClickedAddRow: (_, { model }) => ({
      model: {
        rows: [...model.rows, { id: `counter-${model.nextRowId}`, count: 0 }],
        nextRowId: model.nextRowId + 1,
      },
    }),
    ClickedRemoveRow: ({ id }, { model }) => ({
      model: { ...model, rows: model.rows.filter((row) => row.id !== id) },
    }),
    GotCounterMessage: ({ id, message }, { model }) => ({
      model: {
        ...model,
        rows: model.rows.map((row) =>
          row.id === id ? { ...row, count: step(row.count, message) } : row,
        ),
      },
    }),
  },
});
