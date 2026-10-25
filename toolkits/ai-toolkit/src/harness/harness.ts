import { Layer } from 'effect';
import type { Projected, Raw } from '../contract/index.js';
import { type Harness, Harnesses } from './contract/index.js';

/*
 * `@kestack/ai-toolkit/harness`: running Coding Harnesses, for whoever
 * runs them on Node, as plain Effects. The contract every harness meets
 * (an Agent, its Turns, Forks, Asks, a One-shot Prompt), Claude Code and
 * Codex behind it, the catalog of Harness Binaries checked and the models
 * each can run, and two ways to use a list of harnesses: as the
 * `Harnesses` a program is given, and to project the Raw records each one
 * wrote.
 */

export {
  HarnessBinaries,
  HarnessError,
  Harnesses,
  isRecord,
  OneShotPrompt,
  type Agent,
  type AgentConfig,
  type AskInput,
  type AvailableModel,
  type ForkInput,
  type Harness,
  type RawOut,
  type Setting,
  type TurnEnd,
  type TurnHandle,
  type TurnInput,
  type TurnOut,
  type TurnSteered,
  type TurnStream,
} from './contract/index.js';
export {
  binaryAt,
  checkBinary,
  InvalidBinary,
  Models,
  ModelsError,
  type ModelsOptions,
} from './catalog/index.js';
export { claude } from './claude/index.js';
export { codex, codexOneShot } from './codex/index.js';

/** `list` as the program's Coding Harnesses, each found by its name. */
export const harnesses = (
  list: ReadonlyArray<Harness>,
): Layer.Layer<Harnesses> =>
  Layer.succeed(Harnesses, {
    all: list,
    get: (name) => {
      const found = list.find((harness) => harness.name === name);
      if (!found) throw new Error(`No harness named ${name}`);
      return found;
    },
  });

/**
 * One Raw record to its projected form, by the harness in `list` that
 * wrote it; null when none of them did, or it projects to nothing.
 */
export const projectRaw =
  (list: ReadonlyArray<Harness>) =>
  (raw: Raw): Projected | null =>
    list.find((harness) => harness.name === raw.harness)?.project(raw) ?? null;
