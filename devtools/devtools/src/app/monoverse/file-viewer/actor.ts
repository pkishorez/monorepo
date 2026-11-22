import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import {
  ChangeStatusSchema,
  FileDiffSchema,
  type FileDiff,
} from '../contract/index.js';
import { Monorepo, type MonorepoService } from '../services/monorepo/index.js';

/*
 * One file, opened from the tree, as the branch has it: its text, or
 * while Changes is on and the branch changed it since Compare-to, its
 * diff. A deleted file is only its diff. Closing it Emits `Closed`.
 */

const FileModel = Schema.Struct({
  /** The project's folder, absolute. */
  root: Schema.String,
  /** The branch read; null: the folder as it is on disk. */
  branch: Schema.NullOr(Schema.String),
  path: Schema.String,
  /** Compare-to, while Changes is on; null otherwise. */
  base: Schema.NullOr(Schema.String),
  /** How the branch changed the file since Compare-to, if it did. */
  status: Schema.NullOr(ChangeStatusSchema),
  /**
   * Shown beside a folder's list, which has its own close: closing goes
   * back to the list, and only a phone, showing one at a time, offers it.
   */
  inside: Schema.Boolean,
});

export const FileViewer = Actor.define('FileViewer', {
  requires: [Monorepo],
  input: FileModel,
  model: FileModel,
  state: Schema.TaggedUnion({
    Loading: {},
    Failed: { problem: Schema.String },
    Text: { content: Schema.String, binary: Schema.Boolean },
    Diff: { diff: FileDiffSchema, content: Schema.NullOr(Schema.String) },
  }),
  message: Schema.TaggedUnion({
    Read: { content: Schema.String, binary: Schema.Boolean },
    Diffed: { diff: FileDiffSchema, content: Schema.NullOr(Schema.String) },
    Refused: { problem: Schema.String },
    Closed: {},
  }),
  emits: { Closed: {} },
});

type Model = typeof FileModel.Type;
type Loaded =
  | {
      readonly _tag: 'Read';
      readonly content: string;
      readonly binary: boolean;
    }
  | {
      readonly _tag: 'Diffed';
      readonly diff: FileDiff;
      readonly content: string | null;
    }
  | { readonly _tag: 'Refused'; readonly problem: string };

/** The file's text, or with Compare-to and a change, its diff beside it. */
const read = (
  monorepo: MonorepoService,
  { root, branch, path, base, status }: Model,
): Effect.Effect<Loaded> => {
  const file = monorepo.readFile({ root, branch, path });
  const loaded: Effect.Effect<Loaded, { readonly message: string }> =
    base !== null && status !== null
      ? Effect.all({
          diff: monorepo.fileDiff({ root, branch, base, path }),
          content:
            status === 'deleted'
              ? Effect.succeed(null)
              : Effect.map(file, (text) =>
                  text.binary === true ? null : text.content,
                ),
        }).pipe(
          Effect.map(({ diff, content }) => ({
            _tag: 'Diffed',
            diff,
            content,
          })),
        )
      : Effect.map(file, (text) => ({
          _tag: 'Read',
          content: text.content,
          binary: text.binary === true,
        }));
  return loaded.pipe(
    Effect.catch(({ message }) =>
      Effect.succeed<Loaded>({ _tag: 'Refused', problem: message }),
    ),
  );
};

export const FileViewerLive = FileViewer.build({
  init: (input) => ({
    model: input,
    state: { _tag: 'Loading' },
  }),
  on: {
    Closed: () => ({ emit: { _tag: 'Closed' } }),
  },
  states: {
    Loading: {
      workers: {
        load: {
          run: (self) =>
            Effect.gen(function* () {
              const { model } = yield* self.get;
              const monorepo = yield* Monorepo;
              yield* self.send(yield* read(monorepo, model));
            }),
        },
      },
      on: {
        Read: ({ content, binary }) => ({
          state: { _tag: 'Text', content, binary },
        }),
        Diffed: ({ diff, content }) => ({
          state: { _tag: 'Diff', diff, content },
        }),
        Refused: ({ problem }) => ({ state: { _tag: 'Failed', problem } }),
      },
    },
  },
});
