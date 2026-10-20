import { Clock, type Context, Effect, Semaphore, Stream } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import type { StageStatus } from '../../../../shared/contracts/project/index.ts';
import {
  project as projectEntity,
  run as runEntity,
  stage as stageEntity,
  type StoredProject,
  type StoredStage,
} from './table.ts';

/*
 * The projects part of the User Space's records: each Project, and the
 * stages of its stack, keyed by the project, so one project's stages are
 * one range read.
 */

type Run = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A>;

/** Every page of a query, oldest first. */
const everyPage = <T>(
  page: (after: Entity<T> | undefined) => Effect.Effect<{
    readonly items: ReadonlyArray<Entity<T>>;
    readonly hasMore: boolean;
  }>,
) =>
  Effect.gen(function* () {
    const found: Array<T> = [];
    let after: Entity<T> | undefined;
    while (true) {
      const next = yield* page(after);
      found.push(...next.items.map(({ value }) => value));
      after = next.items.at(-1);
      if (!next.hasMore || after === undefined) return found;
    }
  });

const paged = <T>(after: Entity<T> | undefined) => ({
  excludeDeleted: true,
  ...(after ? { after } : {}),
});

export const makeProjects = (run: Run, table: Context.Context<never>) =>
  Effect.gen(function* () {
    const lock = yield* Semaphore.make(1);

    const all = everyPage<StoredProject>((after) =>
      run(projectEntity.query('primary', { pk: {}, '>=': null }, paged(after))),
    );
    const get = (projectId: string) =>
      run(projectEntity.get({ projectId }, { excludeDeleted: true })).pipe(
        Effect.map((found) => found?.value ?? null),
      );

    const stagesOf = (projectId: string) =>
      everyPage<StoredStage>((after) =>
        run(
          stageEntity.query(
            'primary',
            { pk: { projectId }, '>=': null },
            paged(after),
          ),
        ),
      );
    const getStage = (projectId: string, name: string) =>
      run(stageEntity.get({ projectId, name }, { excludeDeleted: true })).pipe(
        Effect.map((found) => found?.value ?? null),
      );
    const putStage = (record: StoredStage) =>
      Effect.gen(function* () {
        const { projectId, name, ...fields } = record;
        const found = yield* run(stageEntity.get({ projectId, name }));
        const saved =
          found === null
            ? yield* run(stageEntity.insert(record))
            : yield* run(stageEntity.getAndUpdate({ projectId, name }, fields));
        return saved.value;
      });

    return {
      projects: {
        /** Runs `effect` with no other `exclusively` effect in between, so
         * a check that a folder is free and the project made for it go
         * together. */
        exclusively: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          Semaphore.withPermit(lock, effect),
        /** Oldest first. */
        all,
        get,
        insert: (record: StoredProject) =>
          run(projectEntity.insert(record)).pipe(
            Effect.map(({ value }) => value),
          ),
        /** Each time a project or a stage is written. */
        touched: Stream.merge(
          projectEntity.subscribe(),
          stageEntity.subscribe(),
        ).pipe(Stream.as(undefined), Stream.provideContext(table)),
        /** Each time a project, a stage or any run is written. */
        touchedWithRuns: Stream.merge(
          Stream.merge(projectEntity.subscribe(), stageEntity.subscribe()),
          runEntity.subscribe(),
        ).pipe(Stream.as(undefined), Stream.provideContext(table)),
      },
      stages: {
        /** A project's stages, by name. */
        of: stagesOf,
        get: getStage,
        /** Keeps `record`, over the stage of the same project and name. */
        put: putStage,
        /** A run started working on the stage: it shows `status` until the run ends. */
        began: (input: {
          readonly projectId: string;
          readonly stage: string;
          readonly environment: StoredStage['environment'];
          readonly pullRequest: number | null;
          readonly status: StageStatus;
          readonly runId: string;
        }) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            const found = yield* getStage(input.projectId, input.stage);
            return yield* putStage({
              projectId: input.projectId,
              name: input.stage,
              environment: input.environment,
              pullRequest: input.pullRequest,
              lastDeployedCommit: found?.lastDeployedCommit ?? null,
              outputs: found?.outputs ?? {},
              status: input.status,
              lastRunId: input.runId,
              updatedAt: now,
            });
          }),
        /** `commit` deployed the stage, which now has `outputs`: it is live. */
        markDeployed: (input: {
          readonly projectId: string;
          readonly stage: string;
          readonly commit: string;
          readonly outputs: Readonly<Record<string, string>>;
        }) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            const found = yield* getStage(input.projectId, input.stage);
            if (found === null) return null;
            return yield* putStage({
              ...found,
              status: 'live',
              lastDeployedCommit: input.commit,
              outputs: { ...input.outputs },
              updatedAt: now,
            });
          }),
        /** The stage's run ended without deploying it: it shows `status`. */
        markStatus: (projectId: string, name: string, status: StageStatus) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            const found = yield* getStage(projectId, name);
            if (found === null) return null;
            return yield* putStage({ ...found, status, updatedAt: now });
          }),
      },
    };
  });

export type ProjectsStorage = Effect.Success<ReturnType<typeof makeProjects>>;
