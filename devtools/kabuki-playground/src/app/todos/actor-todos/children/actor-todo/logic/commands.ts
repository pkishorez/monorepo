import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Store } from '../../../capabilities/store/contract/index.ts';

export const save = Command.make('save', {
  args: Schema.Struct({ id: Schema.String, title: Schema.String }),
  run: ({ id, title }) =>
    Effect.gen(function* () {
      yield* (yield* Store).save(id, title);
      return { _tag: 'Saved' as const };
    }).pipe(
      Effect.catchTag('ServerDown', ({ reason }) =>
        Effect.succeed({ _tag: 'SaveFailed' as const, reason }),
      ),
    ),
});
