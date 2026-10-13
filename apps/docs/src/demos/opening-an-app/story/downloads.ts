import { Layer, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Shelf } from './capabilities.ts';
import { Download } from './download.ts';

/** The files "+ Add file" takes, in turn. */
export const FILES = ['photos.zip', 'song.mp3', 'notes.pdf', 'movie.mp4'];

const File = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** Owned here, not by the Download, so the list can pause them all. */
  paused: Schema.Boolean,
});

/**
 * A list of files, one keyed Download per file, for as long as its key is in
 * the Model. It controls them only through its data: each file's `paused`
 * reaches its Download as Props, and cancel all empties the list.
 */
export const Downloads = Actor.make('Downloads', {
  model: Schema.Struct({ files: Schema.Array(File), next: Schema.Number }),
  message: Schema.TaggedUnion({
    Add: {},
    Remove: { id: Schema.String },
    Pause: { id: Schema.String },
    Resume: { id: Schema.String },
    PauseAll: {},
    ResumeAll: {},
    CancelAll: {},
  }),
}).build({
  init: () => ({ model: { files: [], next: 0 } }),
  children: { files: Actor.many(Download) },
  invoke: ({ model }) => ({
    files: model.files.map(({ id, name, paused }) => ({
      key: id,
      input: { id, name },
      props: { paused },
    })),
  }),
  provides: (self) =>
    Layer.succeed(Shelf, {
      remove: (id) => self.send({ _tag: 'Remove', id }),
      pause: (id) => self.send({ _tag: 'Pause', id }),
      resume: (id) => self.send({ _tag: 'Resume', id }),
    }),
  on: {
    Add: (_, { model }) => ({
      model: {
        // Newest first.
        files: [
          {
            id: `${model.next + 1}`,
            name: FILES[model.next % FILES.length]!,
            paused: false,
          },
          ...model.files,
        ],
        next: model.next + 1,
      },
    }),
    Remove: ({ id }, { model }) => ({
      model: { ...model, files: model.files.filter((file) => file.id !== id) },
    }),
    Pause: ({ id }, { model }) => ({
      model: { ...model, files: paused(model.files, true, id) },
    }),
    Resume: ({ id }, { model }) => ({
      model: { ...model, files: paused(model.files, false, id) },
    }),
    PauseAll: (_, { model }) => ({
      model: { ...model, files: paused(model.files, true) },
    }),
    ResumeAll: (_, { model }) => ({
      model: { ...model, files: paused(model.files, false) },
    }),
    CancelAll: (_, { model }) => ({ model: { ...model, files: [] } }),
  },
});

/** The files with `paused` set, on the one with `id`, or on every one. */
const paused = (
  files: ReadonlyArray<typeof File.Type>,
  value: boolean,
  id?: string,
) =>
  files.map((file) =>
    id === undefined || file.id === id ? { ...file, paused: value } : file,
  );
