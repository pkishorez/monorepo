import { Effect, Schema } from 'effect';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { SavedDrafts } from '../../../layer/capabilities/index.ts';
import { reasonOf } from '../../machines/index.ts';

/*
 * What the project page asks of its Machine, over that Machine's own
 * socket: forget the project, and with it the Saved Drafts of its new
 * session and its Sessions on this device.
 */

/** Forgets a project; its folder is never touched. */
export const removeProject = Command.make('RemoveProject', {
  args: Schema.Struct({ machineId: Schema.String, id: Schema.String }),
  run: ({ machineId, id }) =>
    CodeClients.on(
      machineId,
      CodeClient.use((api) => api.removeProject({ id })),
    ).pipe(
      Effect.andThen(
        Effect.flatMap(SavedDrafts, (saved) =>
          saved.drop({ _tag: 'Project', machineId, projectId: id }),
        ),
      ),
      Effect.as({ _tag: 'Removed' as const }),
      Effect.catch((cause) =>
        Effect.succeed({
          _tag: 'RemoveRefused' as const,
          reason: reasonOf(cause),
        }),
      ),
    ),
});
