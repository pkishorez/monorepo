import { Effect } from 'effect';
import {
  HarnessBinaries,
  type AvailableModel,
  type BinaryInfo,
  type HarnessError,
  type Skill,
} from '../../../harness/index.js';
import { describe, resolveExecutable, type Executable } from './executable.js';
import { askIdle } from './idle-query.js';
import { toAvailableModels } from './models.js';
import { toSkills } from './skills.js';

const current: Effect.Effect<Executable, never, HarnessBinaries> = Effect.gen(
  function* () {
    const binaries = yield* HarnessBinaries;
    return resolveExecutable(yield* binaries.path('claude'));
  },
);

/**
 * The Claude Code to launch, read from HarnessBinaries every time a process
 * starts; undefined lets the SDK run its bundled one.
 */
export const executable: Effect.Effect<
  string | undefined,
  never,
  HarnessBinaries
> = Effect.map(current, (found) => found.path);

/** The Harness Binary Claude runs, and what its `--version` prints. */
export const binary: Effect.Effect<BinaryInfo, never, HarnessBinaries> =
  Effect.flatMap(current, describe);

/** The models this login can run, as Claude Code offers them. */
export const availableModels: Effect.Effect<
  ReadonlyArray<AvailableModel>,
  HarnessError,
  HarnessBinaries
> = executable.pipe(
  Effect.flatMap((path) =>
    askIdle({ executable: path }, 'its models', (live) =>
      live.supportedModels(),
    ),
  ),
  Effect.map(toAvailableModels),
);

/** The Skills Claude Code offers in a folder. */
export const skills = (
  cwd: string,
): Effect.Effect<ReadonlyArray<Skill>, HarnessError, HarnessBinaries> =>
  executable.pipe(
    Effect.flatMap((path) =>
      askIdle({ cwd, executable: path }, 'its skills', (live) =>
        live.supportedCommands(),
      ),
    ),
    Effect.map(toSkills),
  );
