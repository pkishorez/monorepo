import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Server } from '../../../../../services/server/contract/index.ts';

const Line = Schema.Struct({ id: Schema.String, title: Schema.String });

const asked = <F extends Schema.Struct.Fields>(
  fields: F,
  description: string,
) => Schema.Struct(fields).annotate({ description });

export const TodosShape = Actor.define('Todos', {
  description:
    'A to-do list loaded from the server: one Todo Child per to-do, and the list keeps which ones are done.',
  requires: [Server],
  model: {
    todos: Schema.Array(Line),
    done: Schema.Array(Schema.String),
    syncing: Schema.Array(Schema.String),
    next: Schema.Number,
  },
  state: Schema.TaggedUnion({
    Loading: {},
    Ready: {},
    Failed: { reason: Schema.String },
  }),
  message: {
    Loaded: {
      todos: Schema.Array(
        Schema.Struct({ ...Line.fields, done: Schema.Boolean }),
      ),
    },
    LoadFailed: { reason: Schema.String },
    Toggled: { id: Schema.String },
    Synced: { id: Schema.String, done: Schema.Boolean },
    Deleted: { id: Schema.String },
    Retried: asked({}, 'Ask the server for the to-dos again'),
    Added: asked(
      { title: Schema.String },
      'Add a to-do at the end of the list; a blank title is ignored',
    ),
    Filled: asked({}, 'Add 50 to-dos at once, to see a long list'),
    Cleared: asked({}, 'Remove every to-do that is done'),
    AllToggled: asked(
      {},
      'Mark every to-do done, or every one not done when all already are',
    ),
  },
});
