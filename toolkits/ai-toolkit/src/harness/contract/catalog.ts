import { Context, Data, Effect } from 'effect';
import type { HarnessName } from '../../contract/raw/index.js';
import type {
  BinaryInfo,
  ConfigFolderInfo,
  ModelInfo,
} from '../../contract/wire/index.js';
import { HarnessAccount, type Harness } from './harness.js';

/*
 * What the catalog offers, apart from how it does it: the Models a program
 * asks for, and the Harness Host a Harness Account stands on. The
 * catalog's Node parts, which read files, the environment and run
 * processes, give them (`../catalog`), so code that only asks runs in a
 * browser too, over fakes.
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

/**
 * The Harness Host: what a Harness Account stands on, on this computer.
 * Whether a Harness Binary runs, and which config folder an account
 * really uses. Signing a Harness Account in reads it.
 */
export class HarnessHost extends Context.Service<
  HarnessHost,
  {
    /** `harness`'s binary run as `account`: its path, version, or why it does not run. */
    readonly binaryAt: (
      harness: Harness,
      account: HarnessAccount['Service'],
    ) => Effect.Effect<BinaryInfo>;
    /** The path the user `given`, `~` expanded and made absolute, once it runs as `harness`'s binary. */
    readonly checkBinary: (
      harness: Harness,
      given: string,
    ) => Effect.Effect<string, InvalidBinary>;
    /** Where `harness`, run with `configFolder` or none, keeps its config, and why there. */
    readonly configFolderOf: (
      harness: HarnessName,
      configFolder: string | undefined,
    ) => Effect.Effect<ConfigFolderInfo>;
  }
>()('@kestack/ai-toolkit/HarnessHost') {}

export class ModelsError extends Data.TaggedError('ModelsError')<{
  readonly message: string;
}> {}

/** The Language Models each harness can run. */
export class Models extends Context.Service<
  Models,
  {
    /** The models `harness` can run as the Harness Account, newest first. */
    readonly list: (
      harness: Harness,
    ) => Effect.Effect<ReadonlyArray<ModelInfo>, ModelsError, HarnessAccount>;
    /** The account's default model, else the harness's own. */
    readonly defaultModel: (
      harness: Harness,
    ) => Effect.Effect<string, never, HarnessAccount>;
  }
>()('@kestack/ai-toolkit/Models') {}
