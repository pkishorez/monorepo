import { Effect } from 'effect';
import { CodeClient, type HarnessName } from '@kestack/connect/code';
import { orRefused } from '../../../machines/index.ts';

/*
 * What the catalog reads from the server: the agents it runs, the models
 * an agent takes, and the Skills an agent offers in a project's folder,
 * each ending in what came back or why it could not be read.
 */

export const loadHarnesses = orRefused(
  CodeClient.use((api) => api.harnesses()),
  (harnesses) => ({ _tag: 'HarnessesLoaded' as const, harnesses }),
).pipe(
  Effect.map((result) =>
    result._tag === 'Refused'
      ? { _tag: 'HarnessesFailed' as const, reason: result.reason }
      : result,
  ),
);

export const loadModels = (harness: HarnessName) =>
  orRefused(
    CodeClient.use((api) => api.models({ harness })),
    (models) => ({ _tag: 'ModelsLoaded' as const, harness, list: models }),
  ).pipe(
    Effect.map((result) =>
      result._tag === 'Refused'
        ? { _tag: 'ModelsFailed' as const, harness, reason: result.reason }
        : result,
    ),
  );

export const loadSkills = (projectId: string, harness: HarnessName) =>
  orRefused(
    CodeClient.use((api) => api.skills({ projectId, harness })),
    (skills) => ({ _tag: 'SkillsLoaded' as const, harness, list: skills }),
  ).pipe(
    Effect.map((result) =>
      result._tag === 'Refused'
        ? { _tag: 'SkillsFailed' as const, harness, reason: result.reason }
        : result,
    ),
  );
