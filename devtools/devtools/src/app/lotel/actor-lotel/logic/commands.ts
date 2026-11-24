import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Telemetry } from '../../services/telemetry/contract/index.js';
import { Toasts } from '../../services/toasts/contract/index.js';

// 3. Clear
export const clear = Command.make('clear', {
  run: () =>
    Effect.gen(function* () {
      const telemetry = yield* Telemetry;
      const deleted = yield* telemetry.clear;
      return { _tag: 'Cleared' as const, deleted };
    }).pipe(
      Effect.catch((cause) =>
        Effect.succeed({
          _tag: 'ClearFailed' as const,
          message: cause.message,
        }),
      ),
    ),
});

/** Tells the reader how something went, in a toast. */
export const notify = Command.make('notify', {
  args: Schema.Struct({
    type: Schema.Literals(['success', 'error']),
    title: Schema.String,
    description: Schema.optional(Schema.String),
  }),
  run: (shown) =>
    Effect.gen(function* () {
      const toasts = yield* Toasts;
      yield* toasts.show(shown);
    }),
});
