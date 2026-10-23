import { Effect, Schema } from 'effect';
import { HarnessInfo } from '@kestack/ai-toolkit/api';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';
import { orRefused } from '../../../../refusal/index.ts';

/*
 * What a Machine's Harness Binaries ask of it, over its own socket.
 */

/** Sets an agent's Harness Binary; null goes back to its default. */
export const setHarnessBinary = Command.make('SetHarnessBinary', {
  args: Schema.Struct({
    machineId: Schema.String,
    harness: HarnessInfo.fields.name,
    path: Schema.NullOr(Schema.String),
  }),
  run: ({ machineId, ...args }) =>
    orRefused(
      AiClients.on(
        machineId,
        AiClient.use((api) => api.setHarnessBinary(args)),
      ),
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
