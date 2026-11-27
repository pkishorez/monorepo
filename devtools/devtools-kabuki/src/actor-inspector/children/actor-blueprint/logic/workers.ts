import { Effect } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';
import { KabukiSession } from '../../../../services/kabuki-session/contract/index.ts';
import type { BlueprintShape } from './shared/index.ts';

export const workers: WorkersOf<typeof BlueprintShape> = {
  print: {
    while: ({ model }) => model.root === null,
    run: (self) =>
      Effect.flatMap(KabukiSession, (session) => session.blueprint()).pipe(
        Effect.matchEffect({
          onSuccess: ({ root }) => self.send({ _tag: 'Printed', root }),
          onFailure: () =>
            self.send({
              _tag: 'Failed',
              problem: 'The Kabuki Session did not answer.',
            }),
        }),
      ),
  },
};
