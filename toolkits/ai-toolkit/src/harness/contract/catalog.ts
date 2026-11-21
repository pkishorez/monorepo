import { Context, Data, Effect } from 'effect';
import type { BinaryInfo, ModelInfo } from '../../contract/wire/index.js';
import { HarnessAccount, type Harness } from './harness.js';

/*
 * What the catalog offers, apart from how it does it: the Models a program
 * asks for, and what a Harness Binary is. The catalog's Node parts, which
 * read files and run processes, give them (`../catalog`), so code that only
 * asks runs in a browser too.
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
