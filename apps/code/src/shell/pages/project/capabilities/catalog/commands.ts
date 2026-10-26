import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import {
  Kept,
  Machines,
  shelf,
} from '../../../../../layer/capabilities/index.ts';
import { type Change, type Keeper, SkillsRead, update } from './catalog.ts';

/*
 * What the catalog's keeper asks after a Change: its project's Skills
 * kept, and its Machine's Kit asked again.
 */

/** A project's Skills as kept, for its Account, Machine and project. */
export const SkillsShelf = shelf('project-skills', 1, Schema.Array(SkillsRead));

/** Keeps the project's Skills; a write that fails is lost. */
export const keepSkills = Command.make('KeepSkills', {
  args: Schema.Struct({
    accountId: Schema.String,
    machineId: Schema.String,
    projectId: Schema.String,
    skills: Schema.Array(SkillsRead),
  }),
  run: ({ accountId, machineId, projectId, skills }) =>
    Effect.flatMap(Kept, (kept) =>
      kept.write(SkillsShelf, { accountId, machineId, projectId }, skills),
    ),
});

/** Asks the Machine's Kit to ask the Machine again. */
export const refreshKit = Command.make('RefreshKit', {
  args: Schema.Struct({ machineId: Schema.String }),
  run: ({ machineId }) =>
    Effect.flatMap(Machines, (machines) => machines.refresh(machineId)),
});

/** The keeper after a Change, with what it asks: its Skills kept, its Kit asked again. */
export const changed = (
  keeper: typeof Keeper.Type,
  change: typeof Change.Type,
  {
    machineId,
    projectId,
  }: { readonly machineId: string; readonly projectId: string },
) => {
  const { keeper: next, keep, refresh } = update(keeper, change);
  return {
    keeper: next,
    command: [
      ...(keep === null || next.accountId === null
        ? []
        : [
            keepSkills({
              accountId: next.accountId,
              machineId,
              projectId,
              skills: keep,
            }),
          ]),
      ...(refresh ? [refreshKit({ machineId })] : []),
    ],
  };
};
