import { Schema } from 'effect';
import { Node } from 'effect-oak';
import { Answers, heardReveal, report, Reveals } from '../application/index.js';
import { typed } from '../fields/index.js';
import {
  blankEntry,
  Entry,
  hasErrors,
  isComplete,
  reveal,
  summary,
} from './entry.js';

/*
 * The positions held, as a list the applicant grows and shrinks. Entry ids
 * come from a counter in the Model: Update is pure and replays, so it cannot
 * draw a UUID, and a Command for one (Foldkit's GenerateEntryId) would add a
 * round trip for nothing.
 */

const Model = Schema.Struct({
  entries: Schema.Array(Entry),
  nextId: Schema.Number,
});
type Model = typeof Model.Type;

const changed = (model: Model) => ({
  model,
  commands: [
    report({
      _tag: 'WorkHistory',
      hasErrors: model.entries.some(hasErrors),
      complete: model.entries.length > 0 && model.entries.every(isComplete),
      entries: model.entries.map(summary),
    }),
  ],
});

/** Change the entry with this id. */
const edit = (model: Model, id: number, change: (entry: Entry) => Entry) =>
  changed({
    ...model,
    entries: model.entries.map((entry) =>
      entry.id === id ? change(entry) : entry,
    ),
  });

export const WorkHistory = Node.make('WorkHistory', {
  requires: { answers: Answers, reveals: Reveals },
  model: Model,
  message: Schema.TaggedUnion({
    ClickedAdd: {},
    ClickedRemove: { id: Schema.Number },
    Edited: {
      id: Schema.Number,
      field: Schema.Literals(['company', 'title']),
      value: Schema.String,
    },
    EditedDetail: {
      id: Schema.Number,
      field: Schema.Literals(['start', 'end', 'description']),
      value: Schema.String,
    },
    ToggledCurrent: { id: Schema.Number, current: Schema.Boolean },
    RevealedErrors: {},
  }),
}).build({
  init: () => ({ model: { entries: [blankEntry(0)], nextId: 1 } }),
  lifetime: () => heardReveal,
  update: {
    ClickedAdd: (_, { model }) =>
      changed({
        entries: [...model.entries, blankEntry(model.nextId)],
        nextId: model.nextId + 1,
      }),
    ClickedRemove: ({ id }, { model }) =>
      changed({
        ...model,
        entries: model.entries.filter((entry) => entry.id !== id),
      }),
    Edited: ({ id, field, value }, { model }) =>
      edit(model, id, (entry) => ({ ...entry, [field]: typed(value) })),
    EditedDetail: ({ id, field, value }, { model }) =>
      edit(model, id, (entry) => ({ ...entry, [field]: value })),
    ToggledCurrent: ({ id, current }, { model }) =>
      edit(model, id, (entry) => ({ ...entry, current })),
    RevealedErrors: (_, { model }) =>
      changed({ ...model, entries: model.entries.map(reveal) }),
  },
});
