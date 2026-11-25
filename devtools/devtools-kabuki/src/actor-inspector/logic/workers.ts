import { Effect, Stream } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';
import { KabukiSession } from '../../services/kabuki-session/contract/index.ts';
import type { InspectorShape } from './shared/index.ts';

export const workers: WorkersOf<typeof InspectorShape> = {
  fakes: {
    while: ({ model }) => !model.presenting,
    run: (self) =>
      Effect.flatMap(KabukiSession, (session) =>
        session
          .fakes()
          .pipe(
            Stream.runForEach((fakes) => self.send({ _tag: 'Listed', fakes })),
          ),
      ).pipe(Effect.catch(() => self.send({ _tag: 'Listed', fakes: [] }))),
  },
};
