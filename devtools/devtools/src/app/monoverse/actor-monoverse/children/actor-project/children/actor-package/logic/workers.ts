import { Effect } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';

import { Projects } from '../../../../../../services/projects/contract/index.js';
import { isReading, readAt, type PackageShape } from './shared/index.js';

export const workers: WorkersOf<typeof PackageShape> = {
  read: {
    each: ({ model, props, state }) =>
      isReading(state, props.branch, model.tries, props.reloads)
        ? [readAt(props.branch, model.tries, props.reloads)]
        : [],
    run: (self, at) =>
      Effect.gen(function* () {
        const { model, props } = yield* self.get;
        const projects = yield* Projects;
        const message = yield* projects
          .readPackage({
            root: model.root,
            branch: props.branch,
            path: model.path,
          })
          .pipe(
            Effect.map((contents) => ({
              _tag: 'Read' as const,
              at,
              contents,
            })),
            Effect.catch(({ message: problem }) =>
              Effect.succeed({ _tag: 'Refused' as const, at, problem }),
            ),
          );
        yield* self.send(message);
      }),
  },
};
