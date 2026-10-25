import { Effect, Schema } from 'effect';
import {
  CodeClient,
  CodeClients,
  SpeechToTextState,
} from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { SavedMachines } from '../../../../../layer/capabilities/index.ts';
import { orRefused } from '../../../../machines/index.ts';

/*
 * What a Machine's Speech to Text switch asks of it, over its own socket,
 * and keeps of what it said on this device.
 */

/** Switches it on, or off, which deletes the model; the feed shows what came of it. */
export const switchSpeechToText = Command.make('SwitchSpeechToText', {
  args: Schema.Struct({ machineId: Schema.String, on: Schema.Boolean }),
  run: ({ machineId, on }) =>
    orRefused(
      CodeClients.on(
        machineId,
        CodeClient.use((api) =>
          on ? api.enableSpeechToText() : api.disableSpeechToText(),
        ),
      ),
      () => ({ _tag: 'Switched' as const }),
    ),
});

/** Keeps how it stands as the Machine said, for its Account; a write that fails is lost. */
export const keepSpeech = Command.make('KeepSpeech', {
  args: Schema.Struct({
    accountId: Schema.String,
    machineId: Schema.String,
    state: SpeechToTextState,
  }),
  run: ({ accountId, machineId, state }) =>
    Effect.flatMap(SavedMachines, (saved) =>
      saved.keepSettings(accountId, machineId, { speech: state }),
    ),
});
