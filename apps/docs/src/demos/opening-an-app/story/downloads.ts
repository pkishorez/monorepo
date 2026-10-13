import { Layer, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { Shelf } from './capabilities.ts';
import { Download } from './download.ts';

/** The files "+ Add file" takes, in turn. */
export const FILES = ['photos.zip', 'song.mp3', 'notes.pdf', 'movie.mp4'];

const File = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  since: Schema.Number,
});

/** A list of files, one keyed Download per file, for as long as its key is in the Model. */
export const Downloads = Actor.make('Downloads', {
  model: Schema.Struct({ files: Schema.Array(File), next: Schema.Number }),
  message: Schema.TaggedUnion({
    Add: {},
    Remove: { id: Schema.String },
  }),
}).build({
  init: () => ({ model: { files: [], next: 0 } }),
  children: { files: Actor.many(Download) },
  invoke: ({ model }) => ({
    files: model.files.map((file) => ({ key: file.id, input: file })),
  }),
  provides: (self) =>
    Layer.succeed(Shelf, {
      remove: (id) => self.send({ _tag: 'Remove', id }),
    }),
  on: {
    Add: (_, { model, at }) => ({
      model: {
        // Newest first.
        files: [
          {
            id: `${model.next + 1}`,
            name: FILES[model.next % FILES.length]!,
            since: at,
          },
          ...model.files,
        ],
        next: model.next + 1,
      },
    }),
    Remove: ({ id }, { model }) => ({
      model: { ...model, files: model.files.filter((file) => file.id !== id) },
    }),
  },
});
