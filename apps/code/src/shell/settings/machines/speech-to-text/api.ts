import { Effect, Schedule, Schema, Stream } from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';
import { keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';
import { orRefused } from '../../../../refusal/index.ts';

/*
 * What a Machine's Speech to Text switch asks of it, over its own socket.
 */

/** How it stands on one Machine, now and on each change; a feed it refuses is tried again a little later. */
export const speechToText = (machineId: string) =>
  AiClients.stream(
    machineId,
    keepSubscribed(() =>
      Stream.unwrap(Effect.map(AiClient, (api) => api.watchSpeechToText())),
    ),
  ).pipe(
    Stream.retry(Schedule.spaced('5 seconds')),
    // Retried forever, so it never fails.
    Stream.orDie,
  );

/** Switches it on, or off, which deletes the model; the feed shows what came of it. */
export const switchSpeechToText = Command.make('SwitchSpeechToText', {
  args: Schema.Struct({ machineId: Schema.String, on: Schema.Boolean }),
  run: ({ machineId, on }) =>
    orRefused(
      AiClients.on(
        machineId,
        AiClient.use((api) =>
          on ? api.enableSpeechToText() : api.disableSpeechToText(),
        ),
      ),
      () => ({ _tag: 'Switched' as const }),
    ),
});
