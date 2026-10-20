import { Effect, Queue, Stream } from 'effect';
import type {
  Environment,
  Project,
  Stage,
} from '../../../../shared/contracts/project/index.ts';
import type {
  StoredEnvironment,
  StoredProject,
  StoredStage,
} from '../../services/storage/index.ts';

/*
 * What the owner's tabs see of the stored records: a variable's name, never
 * its sealed value.
 */

const environmentOf = (environment: StoredEnvironment): Environment => ({
  credentials: { ...environment.credentials },
  variables: environment.variables.map(({ name }) => ({ name })),
});

export const projectOf = (stored: StoredProject): Project => ({
  projectId: stored.projectId,
  connectionId: stored.connectionId,
  repo: { id: stored.repo.id, fullName: stored.repo.fullName },
  folder: stored.folder,
  setupCommand: stored.setupCommand,
  productionBranch: stored.productionBranch,
  stackName: stored.stackName,
  production: environmentOf(stored.production),
  preview:
    stored.preview === 'same-as-production'
      ? 'same-as-production'
      : environmentOf(stored.preview),
  createdAt: stored.createdAt,
});

export const stageOf = (stored: StoredStage): Stage => ({
  projectId: stored.projectId,
  name: stored.name,
  environment: stored.environment,
  pullRequest: stored.pullRequest,
  lastDeployedCommit: stored.lastDeployedCommit,
  status: stored.status,
  outputs: { ...stored.outputs },
  lastRunId: stored.lastRunId,
  updatedAt: stored.updatedAt,
});

/**
 * `read` now, then again each time `touched` says something was written,
 * subscribed before the first read so no write is missed; a value equal to
 * the last one sent is not sent again.
 */
export const live = <A, E>(
  touched: Stream.Stream<void>,
  read: Effect.Effect<A, E>,
): Stream.Stream<A, E> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const queue = yield* Queue.sliding<void>(1);
      yield* Effect.forkScoped(
        Stream.runForEach(touched, () => Queue.offer(queue, undefined)),
      );
      yield* Effect.yieldNow;
      yield* Queue.offer(queue, undefined);
      return Stream.fromQueue(queue).pipe(
        Stream.mapEffect(() => read),
        Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      );
    }),
  );
