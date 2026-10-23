import { Effect, Schema } from 'effect';
import { AttachmentSchema, HarnessInfo } from '@kestack/ai-toolkit/api';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';
import { orRefused, reasonOf } from '../../refusal/index.ts';

/*
 * What the project page asks of its Machine, over that Machine's own
 * socket: start a session in it, or forget it.
 */

/** Starts a session already running its first message. */
export const startSession = Command.make('StartSession', {
  args: Schema.Struct({
    machineId: Schema.String,
    projectId: Schema.String,
    harness: HarnessInfo.fields.name,
    model: Schema.String,
    settings: Schema.Record(Schema.String, Schema.String),
    text: Schema.String,
    attachments: Schema.Array(AttachmentSchema),
  }),
  run: ({ machineId, ...args }) =>
    orRefused(
      AiClients.on(
        machineId,
        AiClient.use((api) => api.startSession(args)),
      ),
      (session) => ({
        _tag: 'Started' as const,
        sessionId: session.id,
      }),
    ),
});

/** Forgets a project; its folder is never touched. */
export const removeProject = Command.make('RemoveProject', {
  args: Schema.Struct({ machineId: Schema.String, id: Schema.String }),
  run: ({ machineId, id }) =>
    AiClients.on(
      machineId,
      AiClient.use((api) => api.removeProject({ id })),
    ).pipe(
      Effect.as({ _tag: 'Removed' as const }),
      Effect.catch((cause) =>
        Effect.succeed({
          _tag: 'RemoveRefused' as const,
          reason: reasonOf(cause),
        }),
      ),
    ),
});
