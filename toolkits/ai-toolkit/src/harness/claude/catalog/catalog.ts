import { Effect } from 'effect';
import type {
  AvailableModel,
  BinaryInfo,
  HarnessAccount,
  HarnessError,
  Skill,
} from '../../contract/index.js';
import { current, describe, executable } from './executable.js';
import { askIdle } from './idle-query.js';
import { toAvailableModels } from './models.js';
import { toSkills } from './skills.js';

export { executable, type Executable } from './executable.js';

/** The Harness Binary Claude runs, and what its `--version` prints. */
export const binary: Effect.Effect<BinaryInfo, never, HarnessAccount> =
  Effect.flatMap(current, describe);

/** The models this login can run, as Claude Code offers them. */
export const availableModels: Effect.Effect<
  ReadonlyArray<AvailableModel>,
  HarnessError,
  HarnessAccount
> = executable.pipe(
  Effect.flatMap((found) =>
    askIdle({ executable: found }, 'its models', (live) =>
      live.supportedModels(),
    ),
  ),
  Effect.map(toAvailableModels),
);

/** The Skills Claude Code offers in a folder. */
export const skills = (
  cwd: string,
): Effect.Effect<ReadonlyArray<Skill>, HarnessError, HarnessAccount> =>
  executable.pipe(
    Effect.flatMap((found) =>
      askIdle({ cwd, executable: found }, 'its skills', (live) =>
        live.supportedCommands(),
      ),
    ),
    Effect.map(toSkills),
  );
