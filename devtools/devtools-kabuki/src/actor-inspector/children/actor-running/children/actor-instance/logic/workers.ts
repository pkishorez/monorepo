import { Effect } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';
import { KabukiSession } from '../../../../../../services/kabuki-session/contract/index.ts';
import type { InstanceShape } from './shared/index.ts';

export const workers: WorkersOf<typeof InstanceShape> = {
  read: {
    each: ({ props }) => [
      props.at === null ? `head#${props.revision}` : `${props.at}`,
    ],
    run: (self) =>
      Effect.gen(function* () {
        const { model, props } = yield* self.get;
        const session = yield* KabukiSession;
        const open = [model.address];
        const look = yield* session.look(
          props.at === null ? { open } : { at: props.at, open },
        );
        const opened = look.opened[model.address];
        if (opened) yield* self.send({ _tag: 'Read', opened });
      }).pipe(
        Effect.catch((error) =>
          self.send({
            _tag: 'Failed',
            problem:
              error._tag === 'InstanceNotFound'
                ? 'Not there at this Step'
                : error._tag === 'StepNotFound'
                  ? 'This Step is no longer kept'
                  : 'The Kabuki Session did not answer',
          }),
        ),
      ),
  },
};
