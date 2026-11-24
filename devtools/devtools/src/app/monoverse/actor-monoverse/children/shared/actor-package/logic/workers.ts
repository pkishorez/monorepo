import { Effect } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';

import { Monorepo } from '../../../../../services/monorepo/contract/index.js';
import { isReading, readAt, type PackageShape } from './shared/index.js';

export const workers: WorkersOf<typeof PackageShape> = {
  // 1. Read
  read: {
    each: ({ model, props, state }) =>
      isReading(state, props.branch, model.tries)
        ? [readAt(props.branch, model.tries)]
        : [],
    run: (self, at) =>
      Effect.gen(function* () {
        const { model, props } = yield* self.get;
        const monorepo = yield* Monorepo;
        const message = yield* monorepo
          .readPackage({
            root: model.root,
            branch: props.branch,
            path: model.path,
          })
          .pipe(
            Effect.map(({ contents, violations }) => ({
              _tag: 'Read' as const,
              at,
              contents,
              violations,
            })),
            Effect.catch(({ message: problem }) =>
              Effect.succeed({ _tag: 'Refused' as const, at, problem }),
            ),
          );
        yield* self.send(message);
      }),
  },
};
