import { Effect, Schema } from 'effect';
import { HarnessInfo } from '@kestack/ai-toolkit/api';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';
import { orRefused } from '../../../refusal/index.ts';

/** Every agent's Harness Binary, as a Message; a Worker reads it. */
export const loadBinaries = orRefused(
  AiClient.use((api) => api.harnessBinaries()),
  (binaries) => ({ _tag: 'BinariesLoaded' as const, binaries }),
);

/** Sets an agent's Harness Binary; null goes back to its default. */
export const setHarnessBinary = Command.make('SetHarnessBinary', {
  args: Schema.Struct({
    harness: HarnessInfo.fields.name,
    path: Schema.NullOr(Schema.String),
  }),
  run: (args) =>
    orRefused(
      AiClient.use((api) => api.setHarnessBinary(args)),
      (binary) => ({ _tag: 'BinarySaved' as const, binary }),
    ).pipe(
      Effect.map((result) =>
        result._tag === 'Refused'
          ? {
              _tag: 'BinaryRefused' as const,
              harness: args.harness,
              reason: result.reason,
            }
          : result,
      ),
    ),
});
