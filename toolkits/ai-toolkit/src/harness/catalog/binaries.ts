import { Data, Effect } from 'effect';
import type { BinaryInfo } from '../../contract/wire/index.js';
import { HarnessAccount, type Harness } from '../contract/index.js';
import { expand, whyNotExecutable } from './executable.js';

/*
 * Harness Binaries, checked: what a harness runs as on a given path, and
 * whether a path the user gave can be its binary. Which Harness Accounts
 * there are is kept by the caller, who gives one as `HarnessAccount`.
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
    const info = yield* binaryAt(harness, { binary: path, home: undefined });
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
