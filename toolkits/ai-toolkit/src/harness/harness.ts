import { Layer } from 'effect';
import type { Projected, Raw } from '../contract/index.js';
import { type Harness, Harnesses } from './contract/index.js';

/*
 * `@kestack/ai-toolkit/harness`: the Coding Harnesses as plain Effects,
 * only what runs in a browser too. The contract every harness meets (an
 * Agent, its Turns, Forks, Asks, a One-shot Prompt), the Models a program
 * asks for, and two ways to use a list of harnesses: as the `Harnesses` a
 * program is given, and to project the Raw records each one wrote. The
 * Harness Host a Harness Account stands on is a key here too. Claude
 * Code, Codex and the catalog's Node parts are `./node.ts`
 * (`@kestack/ai-toolkit/harness/node`).
 */

export {
  binaryAt,
  HarnessAccount,
  HarnessError,
  Harnesses,
  HarnessHost,
  InvalidBinary,
  Models,
  ModelsError,
  isRecord,
  OneShotPrompt,
  QuestionNotAsked,
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
