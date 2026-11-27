import { Effect } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';

import { Projects } from '../../services/projects/contract/index.js';
import type { MonoverseShape, Place } from './shared/index.js';

export const workers: WorkersOf<typeof MonoverseShape> = {
  projects: {
    run: (self) =>
      Effect.gen(function* () {
        const service = yield* Projects;
        const message = yield* service.projects().pipe(
          Effect.map((projects) => ({ _tag: 'Listed' as const, projects })),
          Effect.catch(({ message: problem }) =>
            Effect.succeed({ _tag: 'ListRefused' as const, problem }),
          ),
        );
        yield* self.send(message);
      }),
  },
  follow: {
    each: ({ props }) => (props === undefined ? [] : [JSON.stringify(props)]),
    run: (self, place) =>
      self.send({ _tag: 'Followed', place: JSON.parse(place) as Place }),
  },
};
