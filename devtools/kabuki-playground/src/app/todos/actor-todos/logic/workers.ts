import { Effect, Schedule } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';
import { Server } from '../../../../services/server/contract/index.ts';
import type { TodosShape } from './shared/index.ts';

const RETRY = Schedule.spaced('2 seconds');

const DONE = ':done';
const OPEN = ':open';

export const sync: WorkersOf<typeof TodosShape>[string] = {
  each: ({ model }) =>
    model.syncing.map((id) => id + (model.done.includes(id) ? DONE : OPEN)),
  run: (self, key) =>
    Effect.gen(function* () {
      const done = key.endsWith(DONE);
      const id = key.slice(0, -(done ? DONE : OPEN).length);
      yield* (yield* Server)
        .mark(id, done)
        .pipe(Effect.retry(RETRY), Effect.orDie);
      yield* self.send({ _tag: 'Synced', id, done });
    }),
};

export const load: WorkersOf<typeof TodosShape>[string] = {
  run: (self) =>
    Effect.gen(function* () {
      const todos = yield* (yield* Server).load;
      yield* self.send({ _tag: 'Loaded', todos });
    }).pipe(
      Effect.catchTag('ServerDown', ({ reason }) =>
        self.send({ _tag: 'LoadFailed', reason }),
      ),
    ),
};
