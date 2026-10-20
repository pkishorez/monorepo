import { Effect } from 'effect';
import { RunError } from '../../../../shared/contracts/run/index.ts';
import { GitHub } from '../../services/github/index.ts';
import { Storage } from '../../services/storage/index.ts';
import { RunLifecycle } from './lifecycle.ts';

/*
 * An Inspect of one folder of one of the owner's repositories, before any
 * project exists: the run New Project starts to read the folder's stack.
 * It changes nothing, so it waits for no other run.
 */

export interface InspectInput {
  readonly connectionId: string;
  /** `owner/name`. */
  readonly repo: string;
  /** From the repository's root; `.` or `''` for the root. */
  readonly folder: string;
  readonly setupCommand: string | null;
  /** A branch or a commit; the repository's default branch when null. */
  readonly ref: string | null;
}

const invalid = (message: string) =>
  new RunError({ reason: 'invalid', message });

/** `folder` as a run keeps it: `.` or `a/b`, never leaving the repository. */
export const folderOf = (folder: string) => {
  const segments = folder
    .trim()
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.');
  if (segments.some((segment) => segment === '..' || segment.includes('\\')))
    return Effect.fail(invalid('The folder must be inside the repository.'));
  return Effect.succeed(segments.length === 0 ? '.' : segments.join('/'));
};

/** Starts the Inspect; answers its run's ID. */
export const startInspect = (input: InspectInput) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const github = yield* GitHub;
    const lifecycle = yield* RunLifecycle;
    const connection = yield* storage.connections.get(input.connectionId);
    const repository = connection?.repositories.find(
      (each) => each.fullName.toLowerCase() === input.repo.toLowerCase(),
    );
    if (connection === null || repository === undefined)
      return yield* new RunError({
        reason: 'not-found',
        message: `${input.repo} isn’t one of this connection’s repositories.`,
      });
    const folder = yield* folderOf(input.folder);
    const setupCommand = input.setupCommand?.trim() || null;
    if (setupCommand !== null && setupCommand.length > 1000)
      return yield* invalid('The setup command is too long.');
    const ref = input.ref?.trim() || repository.defaultBranch;
    const { sha } = yield* github.headCommit({
      installationId: connection.installationId,
      repo: repository.fullName,
      branch: ref,
    });
    return yield* lifecycle.enqueue({
      projectId: null,
      stage: 'inspect',
      kind: 'inspect',
      commit: sha,
      trigger: 'user',
      spec: {
        connectionId: connection.connectionId,
        repo: repository.fullName,
        folder,
        setupCommand,
      },
    });
  });
