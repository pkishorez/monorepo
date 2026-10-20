import { Effect } from 'effect';
import {
  type NewProject,
  PRODUCTION_STAGE,
  ProjectError,
} from '../../../../shared/contracts/project/index.ts';
import type { Run } from '../../../../shared/contracts/run/index.ts';
import { Storage } from '../../services/storage/index.ts';
import { viewOf } from '../run-lifecycle/index.ts';
import { createProject } from './create.ts';
import { live, projectOf, stageOf } from './views.ts';

/*
 * The Projects group's handlers.
 *
 * - list    every project with its Production stage, now and after each
 *           change to a project or a stage;
 * - get     one project, its stages and each stage's latest run, now and
 *           after each change to any of them, a run's every step too;
 * - create  a project from a folder an Inspect read; deploys Production.
 */

const notFound = new ProjectError({
  reason: 'not-found',
  message: 'There is no such project.',
});

export const projectsHandlers = Effect.gen(function* () {
  const storage = yield* Storage;
  const context =
    yield* Effect.context<Effect.Services<ReturnType<typeof createProject>>>();

  const summaries = Effect.gen(function* () {
    const projects = yield* storage.projects.all;
    return yield* Effect.forEach(projects, (project) =>
      Effect.map(
        storage.stages.get(project.projectId, PRODUCTION_STAGE),
        (production) => ({
          project: projectOf(project),
          production: production === null ? null : stageOf(production),
        }),
      ),
    );
  });

  const detail = (projectId: string) =>
    Effect.gen(function* () {
      const project = yield* storage.projects.get(projectId);
      if (project === null) return yield* notFound;
      const stages = yield* storage.stages.of(projectId);
      const runs: Array<Run> = [];
      for (const stage of stages) {
        if (stage.lastRunId === null) continue;
        const run = yield* storage.runs.get(stage.lastRunId);
        if (run !== null) runs.push(viewOf(run));
      }
      return {
        project: projectOf(project),
        stages: stages.map(stageOf),
        runs: runs.sort((a, b) => b.queuedAt - a.queuedAt),
      };
    });

  return {
    'Projects.list': () => live(storage.projects.touched, summaries),
    'Projects.get': ({ projectId }: { readonly projectId: string }) =>
      live(storage.projects.touchedWithRuns, detail(projectId)),
    'Projects.create': (input: NewProject) =>
      createProject(input).pipe(Effect.provideContext(context)),
  };
});
