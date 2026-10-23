import { Schema } from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';
import { orRefused } from '../../../../refusal/index.ts';

/*
 * What a Machine's Speech to Text switch asks of it, over its own socket.
 */

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
