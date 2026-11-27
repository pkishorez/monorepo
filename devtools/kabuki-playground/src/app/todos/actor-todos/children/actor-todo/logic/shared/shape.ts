import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Store } from '../../../../capabilities/store/contract/index.ts';

const asked = <F extends Schema.Struct.Fields>(
  fields: F,
  description: string,
) => Schema.Struct(fields).annotate({ description });

export const TodoShape = Actor.define('Todo', {
  description:
    'One to-do: its title, renamed and saved through the Store its list Provides; whether it is done comes from the list as Props.',
  requires: [Store],
  input: Schema.Struct({ id: Schema.String, title: Schema.String }),
  props: Schema.Struct({ done: Schema.Boolean }),
  model: { id: Schema.String, title: Schema.String },
  state: Schema.TaggedUnion({
    Idle: {},
    Editing: {},
    Saving: { title: Schema.String },
    Failed: { title: Schema.String, reason: Schema.String },
  }),
  message: {
    Saved: {},
    SaveFailed: { reason: Schema.String },
    Toggled: asked(
      {},
      'Mark this to-do done or not done; the list keeps which ones are',
    ),
    Deleted: asked({}, 'Delete this to-do from the list'),
    EditingStarted: asked({}, 'Start renaming this to-do'),
    EditingCancelled: asked({}, 'Stop renaming and keep the title it had'),
    Renamed: asked(
      { title: Schema.String },
      'Save a new title; a blank or unchanged one only stops renaming',
    ),
    Retried: asked({}, 'Try saving the new title again'),
  },
  emits: { Toggled: {}, Deleted: {} },
});
