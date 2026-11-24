import { Effect, Stream } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';
import { Sessions } from '../../services/sessions/contract/index.js';
import type { KabukiShape } from './shared/index.js';

/** How long the first redial waits, and the longest any waits, in milliseconds. */
const FIRST_WAIT = 250;
const LAST_WAIT = 4000;

export const workers: WorkersOf<typeof KabukiShape> = {
  // 1. Watch
  watch: {
    run: (self) =>
      Effect.gen(function* () {
        const sessions = yield* Sessions;
        let wait = FIRST_WAIT;
        while (true) {
          // A list that ends or fails is the socket closing: Dropped
          // says so, and the next turn dials again.
          yield* sessions.watch.pipe(
            Stream.runForEach((list) => {
              wait = FIRST_WAIT;
              return self.send({ _tag: 'Listed', sessions: list });
            }),
            Effect.catch(() => Effect.void),
          );
          const { model } = yield* self.get;
          if (model.link === 'live') yield* self.send({ _tag: 'Dropped' });
          yield* Effect.sleep(wait);
          wait = Math.min(wait * 2, LAST_WAIT);
        }
      }),
  },
  // 3. Follow: once for each Kabuki Session the Props name, as they
  // start and after each change; '' is none.
  follow: {
    each: ({ props }) => (props === undefined ? [] : [props.session ?? '']),
    run: (self, name) =>
      self.send({ _tag: 'Followed', name: name === '' ? null : name }),
  },
};
