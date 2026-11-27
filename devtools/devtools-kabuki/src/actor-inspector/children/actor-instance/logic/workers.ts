import { Effect } from 'effect';
import type { DataOf, WorkersOf } from '@kestack/kabuki/types';
import { KabukiSession } from '../../../../services/kabuki-session/contract/index.ts';
import type { InstanceShape } from './shared/index.ts';

const lookKey = ({ props }: DataOf<typeof InstanceShape>) =>
  `${props.epoch}|${props.at === null ? `head#${props.revision}` : props.at}`;

export const workers: WorkersOf<typeof InstanceShape> = {
  look: {
    each: (data) => [lookKey(data)],
    run: (self) =>
      Effect.gen(function* () {
        const { model, props } = yield* self.get;
        const session = yield* KabukiSession;
        return yield* session.look({
          address: model.address,
          ...(props.at === null ? {} : { at: props.at }),
        });
      }).pipe(
        Effect.matchEffect({
          onSuccess: (looked) => self.send({ _tag: 'Read', looked }),
          onFailure: (error) =>
            self.send({
              _tag: 'Failed',
              problem:
                error._tag === 'InstanceNotFound'
                  ? 'It is not there at this Step.'
                  : error._tag === 'StepNotFound'
                    ? 'This Step is no longer kept.'
                    : 'The Kabuki Session did not answer.',
            }),
        }),
      ),
  },
};
