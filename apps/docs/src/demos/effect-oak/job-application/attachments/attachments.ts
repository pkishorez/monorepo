import { Schema } from 'effect';
import { Node } from 'effect-oak';
import { Answers, FileInfo, report } from '../application/index.js';

/*
 * A resume and any other files, picked or dropped. The Model keeps each
 * file's name and size, not the File: a Model and its Messages are Schema
 * data that Replay plays back, and a browser File is not. A real app would
 * upload the File in a Command and keep what the server answers.
 */

const Model = Schema.Struct({
  resume: Schema.NullOr(FileInfo),
  others: Schema.Array(FileInfo),
});
type Model = typeof Model.Type;

const changed = (model: Model) => ({
  model,
  commands: [
    report({
      _tag: 'Attachments',
      hasErrors: false,
      complete: true,
      ...model,
    }),
  ],
});

export const Attachments = Node.make('Attachments', {
  requires: { answers: Answers },
  model: Model,
  message: Schema.TaggedUnion({
    DroppedResume: { files: Schema.Array(FileInfo) },
    DroppedOthers: { files: Schema.Array(FileInfo) },
    RemovedResume: {},
    RemovedOther: { index: Schema.Number },
  }),
}).build({
  init: () => ({ model: { resume: null, others: [] } }),
  update: {
    DroppedResume: ({ files }, { model }) =>
      changed({ ...model, resume: files[0] ?? model.resume }),
    DroppedOthers: ({ files }, { model }) =>
      changed({ ...model, others: [...model.others, ...files] }),
    RemovedResume: (_, { model }) => changed({ ...model, resume: null }),
    RemovedOther: ({ index }, { model }) =>
      changed({
        ...model,
        others: model.others.filter((_, at) => at !== index),
      }),
  },
});
