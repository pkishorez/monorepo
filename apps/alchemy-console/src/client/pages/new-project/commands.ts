import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { NewProject } from '../../../shared/contracts/project/index.ts';
import { Api } from '../../../shared/pages/index.ts';

/*
 * New project's errands, each one call to the User Space, ending in one
 * Message: the answer, or `Failed` with words for the member.
 */

const REFUSALS = new Set(['GitHubError', 'RunError', 'ProjectError']);

const failed = (error: unknown) =>
  Effect.succeed({
    _tag: 'Failed' as const,
    message: REFUSALS.has((error as { readonly _tag?: string })._tag ?? '')
      ? (error as { readonly message: string }).message
      : 'Console couldn’t reach your data. Check your connection and try again.',
  });

export const findFolders = Command.make('findFolders', {
  args: Schema.Struct({ connectionId: Schema.String, repo: Schema.String }),
  run: (args) =>
    Effect.gen(function* () {
      const folders = yield* (yield* Api).call((client) =>
        client['Repositories.projectFolders'](args),
      );
      return { _tag: 'FoldersFound' as const, repo: args.repo, folders };
    }).pipe(Effect.catch(failed)),
});

export const startInspect = Command.make('startInspect', {
  args: Schema.Struct({
    attempt: Schema.Number,
    connectionId: Schema.String,
    repo: Schema.String,
    folder: Schema.String,
  }),
  run: ({ attempt, ...args }) =>
    Effect.gen(function* () {
      const runId = yield* (yield* Api).call((client) =>
        client['Runs.inspect']({ ...args, setupCommand: null, ref: null }),
      );
      return { _tag: 'InspectStarted' as const, attempt, runId };
    }).pipe(
      Effect.catch((error) =>
        Effect.map(failed(error), ({ message }) => ({
          _tag: 'InspectRefused' as const,
          attempt,
          message,
        })),
      ),
    ),
});

export const createProject = Command.make('createProject', {
  args: NewProject,
  run: (args) =>
    Effect.gen(function* () {
      const made = yield* (yield* Api).call((client) =>
        client['Projects.create'](args),
      );
      return { _tag: 'Created' as const, ...made };
    }).pipe(Effect.catch(failed)),
});
