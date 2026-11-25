import { Effect } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';

import type { FileDiff } from '../../../../../../../../server/rpc/git/contract/index.js';
import {
  Projects,
  type ProjectsService,
} from '../../../../../../../../services/projects/contract/index.js';
import type { FileViewerShape, Model } from './shared/index.js';

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

const read = (
  projects: ProjectsService,
  { root, branch, path, base, status }: Model,
): Effect.Effect<Loaded> => {
  const file = projects.readFile({ root, branch, path });
  const loaded: Effect.Effect<Loaded, { readonly message: string }> =
    base !== null && status !== null
      ? Effect.all({
          diff: projects.fileDiff({ root, branch, base, path }),
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

export const workers: WorkersOf<typeof FileViewerShape> = {
  load: {
    while: ({ state }) => state._tag === 'Loading',
    run: (self) =>
      Effect.gen(function* () {
        const { model } = yield* self.get;
        const projects = yield* Projects;
        yield* self.send(yield* read(projects, model));
      }),
  },
};
