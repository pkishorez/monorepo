import { Effect, Schema } from 'effect';
import { AttachmentSchema, HarnessInfo } from '@kestack/ai-toolkit/api';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';
import { orRefused, reasonOf } from '../../../refusal/index.ts';

/*
 * What the project page asks of the server: start a session in it, or
 * forget it.
 */

/** Starts a session already running its first message. */
export const startSession = Command.make('StartSession', {
  args: Schema.Struct({
    projectId: Schema.String,
    harness: HarnessInfo.fields.name,
    model: Schema.String,
    settings: Schema.Record(Schema.String, Schema.String),
    text: Schema.String,
    attachments: Schema.Array(AttachmentSchema),
  }),
  run: (args) =>
    orRefused(
      AiClient.use((api) => api.startSession(args)),
      (session) => ({
        _tag: 'Started' as const,
        sessionId: session.id,
      }),
    ),
});

/** Forgets a project; its folder is never touched. */
export const removeProject = Command.make('RemoveProject', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    AiClient.use((api) => api.removeProject({ id })).pipe(
      Effect.as({ _tag: 'Removed' as const }),
      Effect.catch((cause) =>
        Effect.succeed({
          _tag: 'RemoveRefused' as const,
          reason: reasonOf(cause),
        }),
      ),
    ),
});
