import { Effect } from 'effect';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import { reasonOf } from '../../connection/link/index.ts';

/*
 * What a Dictation asks of a Connection, over its own socket: the text of a
 * clip.
 */

/** The text spoken in `audio`, transcribed on one Connection, or why not. */
export const transcribe = (connectionId: string, audio: Uint8Array) =>
  CodeClients.on(
    connectionId,
    CodeClient.use((api) => api.transcribe({ audio })),
  ).pipe(
    Effect.map((text) => ({ _tag: 'Said' as const, text })),
    Effect.catch((cause) =>
      Effect.succeed({ _tag: 'NotSaid' as const, reason: reasonOf(cause) }),
    ),
  );
