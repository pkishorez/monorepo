import { Effect, Stream } from 'effect';
import { CodeClient } from '@kestack/connect/code';
import { Kept, Machines } from '../../../../../layer/capabilities/index.ts';
import { reasonOf } from '../../../../machines/index.ts';
import { SkillsShelf } from './commands.ts';

/*
 * What the catalog reads: the agents and their models from its Machine's
 * Kit, followed; the Skills kept for the project; and the Skills each
 * agent that runs offers in the project's folder, asked of the Machine.
 * Each ends in the Change it makes.
 */

/** 1. The agents and their models as the Machine's Kit holds them, now and on each change. */
export const followKit = (machineId: string) =>
  Stream.unwrap(Effect.map(Machines, ({ kit }) => kit(machineId))).pipe(
    Stream.map((kit) => ({
      _tag: 'KitKnown' as const,
      harnesses: kit?.harnesses ?? null,
      // Only while there are no agents to show is it said why.
      problem: kit?.harnesses === null ? kit.problem : null,
      models: kit?.models ?? [],
    })),
  );

/** 2. The Skills kept for the project, under the Account signed in. */
export const savedSkills = (machineId: string, projectId: string) =>
  Effect.gen(function* () {
    const accountId = yield* (yield* Machines).account;
    const skills = yield* (yield* Kept).read(SkillsShelf, {
      accountId,
      machineId,
      projectId,
    });
    return { _tag: 'SkillsSaved' as const, accountId, skills };
  });

/** 2. The Skills each agent that runs offers in the project's folder, answering the ask `since`. */
export const askSkills = (
  projectId: string,
  accounts: ReadonlyArray<string>,
  since: number,
) =>
  Effect.forEach(
    accounts,
    (account) =>
      CodeClient.use((api) => api.skills({ projectId, account })).pipe(
        Effect.map((list) => ({ account, list, problem: null })),
        Effect.catch((cause) =>
          Effect.succeed({ account, list: [], problem: reasonOf(cause) }),
        ),
      ),
    { concurrency: 'unbounded' },
  ).pipe(
    Effect.map((skills) => ({
      _tag: 'SkillsAnswered' as const,
      since,
      skills,
    })),
  );
