import { Effect } from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { reasonOf } from '../../refusal/index.ts';

/*
 * What a Dictation asks of a Machine, over its own socket: the text of a
 * clip.
 */

/** The text spoken in `audio`, transcribed on one Machine, or why not. */
export const transcribe = (machineId: string, audio: Uint8Array) =>
  AiClients.on(
    machineId,
    AiClient.use((api) => api.transcribe({ audio })),
  ).pipe(
    Effect.map((text) => ({ _tag: 'Said' as const, text })),
    Effect.catch((cause) =>
      Effect.succeed({ _tag: 'NotSaid' as const, reason: reasonOf(cause) }),
    ),
  );
