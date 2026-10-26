import { Effect, Schema } from 'effect';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { dropEverywhere } from '../../layer/capabilities/index.ts';
import { reasonOf } from './refusal.ts';

/*
 * Removing a Project, as the project page and Settings ask it of its
 * Machine, over that Machine's own socket: the Machine removes it and its
 * Sessions, then this device forgets all it kept of it, the Saved Drafts
 * of its new session and its Sessions, and its Skills.
 */

/** Removes a Project; its folder is never touched. */
export const removeProject = Command.make('RemoveProject', {
  args: Schema.Struct({ machineId: Schema.String, id: Schema.String }),
  run: ({ machineId, id }) =>
    CodeClients.on(
      machineId,
      CodeClient.use((api) => api.removeProject({ id })),
    ).pipe(
      Effect.andThen(
        dropEverywhere({ _tag: 'Project', machineId, projectId: id }),
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
