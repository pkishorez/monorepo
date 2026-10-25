import { Effect } from 'effect';
import { CodeClient } from '@kestack/connect/code';
import { orRefused } from '../../../../machines/index.ts';

/*
 * What the catalog reads from the server: the agents it runs, one per
 * Harness Account, the models an account takes, and the Skills it offers
 * in a project's folder,
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

export const loadModels = (account: string) =>
  orRefused(
    CodeClient.use((api) => api.models({ account })),
    (models) => ({ _tag: 'ModelsLoaded' as const, account, list: models }),
  ).pipe(
    Effect.map((result) =>
      result._tag === 'Refused'
        ? { _tag: 'ModelsFailed' as const, account, reason: result.reason }
        : result,
    ),
  );

export const loadSkills = (projectId: string, account: string) =>
  orRefused(
    CodeClient.use((api) => api.skills({ projectId, account })),
    (skills) => ({ _tag: 'SkillsLoaded' as const, account, list: skills }),
  ).pipe(
    Effect.map((result) =>
      result._tag === 'Refused'
        ? { _tag: 'SkillsFailed' as const, account, reason: result.reason }
        : result,
    ),
  );
