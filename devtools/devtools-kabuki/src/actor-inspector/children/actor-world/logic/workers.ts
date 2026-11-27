import { Effect, Schedule, Stream } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';
import { KabukiSession } from '../../../../services/kabuki-session/contract/index.ts';
import type { WorldShape } from './shared/index.ts';

const AGAIN = Schedule.spaced('2 seconds');

export const workers: WorkersOf<typeof WorldShape> = {
  fakes: {
    run: (self) =>
      Effect.flatMap(KabukiSession, (session) =>
        session
          .world()
          .pipe(
            Stream.runForEach((fakes) => self.send({ _tag: 'Heard', fakes })),
          ),
      ).pipe(
        Effect.retry(AGAIN),
        Effect.catch(() => Effect.void),
      ),
  },
};
