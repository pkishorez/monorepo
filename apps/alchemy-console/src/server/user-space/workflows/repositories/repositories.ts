import { Effect, Stream } from 'effect';
import {
  GitHubError,
  type Repository,
} from '../../../../shared/contracts/github/index.ts';
import { GitHub } from '../../services/github/index.ts';
import { Storage } from '../../services/storage/index.ts';

/*
 * The Repositories group's handlers.
 *
 * - list     every repository of every connection, as last read from
 *            GitHub, now and after each change to a connection;
 * - folders  one folder of one of those repositories, at its default
 *            branch, read from GitHub as the connection's installation.
 */

/** The handlers, for the composition root to serve under `ConsoleApi`. */
export const repositoriesHandlers = Effect.gen(function* () {
  const storage = yield* Storage;
  const github = yield* GitHub;
  return {
    'Repositories.list': () =>
      storage.connections.changes.pipe(
        Stream.map((connections) =>
          connections.flatMap(({ connectionId, repositories }) =>
            repositories.map((repository): Repository => ({
              connectionId,
              ...repository,
            })),
          ),
        ),
      ),
    'Repositories.folders': ({
      connectionId,
      repo,
      path,
    }: {
      readonly connectionId: string;
      readonly repo: string;
      readonly path: string;
    }) =>
      Effect.gen(function* () {
        const connection = yield* storage.connections.get(connectionId);
        const repository = connection?.repositories.find(
          (each) => each.fullName.toLowerCase() === repo.toLowerCase(),
        );
        if (connection === null || repository === undefined)
          return yield* new GitHubError({
            reason: 'not-found',
            message: `${repo} isn’t one of this connection’s repositories.`,
          });
        return yield* github.listFolder({
          installationId: connection.installationId,
          repo: repository.fullName,
          ref: repository.defaultBranch,
          path,
        });
      }),
  };
});
