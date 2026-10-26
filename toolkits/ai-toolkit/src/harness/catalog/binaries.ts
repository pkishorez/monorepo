import { homedir } from 'node:os';
import { join } from 'node:path';
import { Data, Effect } from 'effect';
import type { ConfigFolderInfo, HarnessName } from '../../contract/index.js';
import type { BinaryInfo } from '../../contract/wire/index.js';
import { HarnessAccount, type Harness } from '../contract/index.js';
import { expand, whyNotExecutable } from './executable.js';

/*
 * How a Harness Account runs: its Harness Binary, checked, and the config
 * folder it really uses. Which Harness Accounts there are is kept by the
 * caller, who gives one as `HarnessAccount`.
 *
 * 1. Binaries: what a harness runs as on a given path, and whether a path
 *    the user gave can be its binary.
 * 2. The config folder: an account with a folder of its own sets it as
 *    `CLAUDE_CONFIG_DIR` or `CODEX_HOME`; one without runs in this
 *    process's environment, so a variable set there is the folder it uses;
 *    with neither, the harness's own, under home. What runs does not
 *    change: this only says where it is.
 */

/** The path is missing, not executable, or its `--version` failed. */
export class InvalidBinary extends Data.TaggedError('InvalidBinary')<{
  readonly message: string;
}> {}

/** `harness.binary` run as `account`. */
export const binaryAt = (
  harness: Harness,
  account: HarnessAccount['Service'],
): Effect.Effect<BinaryInfo> =>
  harness.binary.pipe(Effect.provideService(HarnessAccount, account));

/** Why a path cannot be this harness's binary, or null when it runs. */
const whyNot = (harness: Harness, path: string) =>
  Effect.gen(function* () {
    const notExecutable = yield* whyNotExecutable(path);
    if (notExecutable !== null) return notExecutable;
    const info = yield* binaryAt(harness, {
      binary: path,
      configFolder: undefined,
    });
    if (info.error !== null) return info.error;
    if (info.version === null) return `${path} did not say which version it is`;
    return null;
  });

/**
 * The path the user `given`, `~` expanded and made absolute, once it runs
 * as this harness's binary.
 */
export const checkBinary = (
  harness: Harness,
  given: string,
): Effect.Effect<string, InvalidBinary> =>
  Effect.gen(function* () {
    const path = expand(given.trim());
    const why = yield* whyNot(harness, path);
    if (why !== null) return yield* new InvalidBinary({ message: why });
    return path;
  });

/** Each harness's variable for it, and its own folder under home. */
const FOLDER: Record<HarnessName, { variable: string; own: string }> = {
  claude: { variable: 'CLAUDE_CONFIG_DIR', own: '.claude' },
  codex: { variable: 'CODEX_HOME', own: '.codex' },
};

/** Where `harness`, run with `configFolder` or none, keeps its config, and why there. */
export const configFolderOf = (
  harness: HarnessName,
  configFolder: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): ConfigFolderInfo => {
  if (configFolder !== undefined)
    return { path: expand(configFolder), from: 'account' };
  const { variable, own } = FOLDER[harness];
  const set = env[variable]?.trim();
  return set !== undefined && set !== ''
    ? { path: expand(set), from: 'environment', variable }
    : { path: join(home, own), from: 'default' };
};
