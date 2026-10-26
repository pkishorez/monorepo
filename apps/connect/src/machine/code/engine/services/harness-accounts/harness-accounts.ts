import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { Clock, Data, Effect, Layer } from 'effect';
import {
  binaryAt,
  checkBinary,
  configFolderOf,
  HarnessError,
  Harnesses,
  type Harness,
  type HarnessAccount,
} from '@kestack/ai-toolkit/harness';
import type {
  BinaryInfo,
  ConfigFolderInfo,
  HarnessName,
} from '@kestack/ai-toolkit/contract';
import { nextUlid } from '@kestack/std-toolkit/core';
import {
  defaultAccount,
  isDefaultAccount,
  type HarnessAccountRecord,
} from '../../../records/index.js';
import { HarnessAccounts, Store } from '../../capabilities/index.js';

/*
 * The Harness Accounts: each harness's Default Account, as the user saved
 * it or as it starts, then every other account the user added, oldest
 * first. An account is kept only once its binary runs (ai-toolkit's
 * `checkBinary`) and its config folder is a folder; a Default Account can
 * be changed but never removed. The records (../../../records/) give the
 * stored shape and each Default Account as it starts, as they do for all
 * of the engine.
 */

/** A Harness Account the user cannot save, or cannot remove. */
export class InvalidAccount extends Data.TaggedError('InvalidAccount')<{
  readonly message: string;
}> {}

/** A Harness Account as a client reads it: what it is set to, and what its binary resolved to. */
export interface HarnessAccountRow {
  readonly id: string;
  readonly harness: HarnessName;
  readonly name: string;
  /** null runs the harness's name from PATH. */
  readonly binaryPath: string | null;
  /** null for the harness's own config folder. */
  readonly configFolder: string | null;
  /** The config folder it really runs with: its own, else this Machine's environment's, else the harness's own. */
  readonly resolvedConfigFolder: ConfigFolderInfo;
  /** Its harness's Default Account, which cannot be removed. */
  readonly isDefault: boolean;
  readonly resolved: BinaryInfo;
}

/** What the user saves: a new account when `id` is null. */
export interface AccountInput {
  readonly id: string | null;
  readonly harness: HarnessName;
  readonly name: string;
  readonly binaryPath: string | null;
  readonly configFolder: string | null;
}

/** Every Harness Account of `harnesses`, each Default Account first. */
export const allAccounts = (harnesses: ReadonlyArray<Harness>) =>
  Effect.flatMap(Store, (store) => store.harnessAccounts).pipe(
    Effect.map((saved) => {
      const names = new Set(harnesses.map((harness) => harness.name));
      const defaults = harnesses.map(
        (harness) =>
          saved.find((account) => account.id === harness.name) ??
          defaultAccount(harness.name),
      );
      const others = saved.filter(
        (account) =>
          !isDefaultAccount(account.id) && names.has(account.harness),
      );
      return [...defaults, ...others];
    }),
  );

/** The Harness Account of `harnesses` with this id, or undefined. */
export const accountOf = (harnesses: ReadonlyArray<Harness>, id: string) =>
  Effect.map(allAccounts(harnesses), (accounts) =>
    accounts.find((account) => account.id === id),
  );

/** What ai-toolkit runs a harness call as, for `account`. */
const toolkitAccount = (
  account: HarnessAccountRecord,
): HarnessAccount['Service'] => ({
  binary: account.binaryPath ?? undefined,
  configFolder: account.configFolder ?? undefined,
});

/** The Harness Accounts as the Store holds them, read on every call. */
export const storedHarnessAccounts: Layer.Layer<
  HarnessAccounts,
  never,
  Store | Harnesses
> = Layer.effect(
  HarnessAccounts,
  Effect.gen(function* () {
    const harnesses = yield* Harnesses;
    const context = yield* Effect.context<Store>();
    return {
      as: (id: string) =>
        accountOf(harnesses.all, id).pipe(
          Effect.provideContext(context),
          Effect.flatMap((found) =>
            found === undefined
              ? Effect.fail(
                  new HarnessError({
                    message:
                      'Its Harness Account was removed from this Machine',
                  }),
                )
              : Effect.succeed(toolkitAccount(found)),
          ),
        ),
    };
  }),
);

/** A Harness Account as a client reads it. */
export const accountRow = (
  harness: Harness,
  account: HarnessAccountRecord,
): Effect.Effect<HarnessAccountRow> =>
  Effect.map(binaryAt(harness, toolkitAccount(account)), (resolved) => ({
    id: account.id,
    harness: account.harness,
    name: account.name,
    binaryPath: account.binaryPath,
    configFolder: account.configFolder,
    resolvedConfigFolder: configFolderOf(
      account.harness,
      account.configFolder ?? undefined,
    ),
    isDefault: isDefaultAccount(account.id),
    resolved,
  }));

const expand = (path: string) =>
  resolve(
    path === '~' || path.startsWith('~/') ? homedir() + path.slice(1) : path,
  );

/** The config folder the user gave, `~` expanded and made absolute, once it is a folder. */
const checkConfigFolder = (given: string) =>
  Effect.gen(function* () {
    const path = expand(given.trim());
    const found = yield* Effect.promise(() =>
      stat(path).then(
        (at) => at.isDirectory(),
        () => null,
      ),
    );
    if (found === null)
      return yield* new InvalidAccount({
        message: `Nothing is at ${path}; sign in with that config folder first`,
      });
    if (!found)
      return yield* new InvalidAccount({ message: `${path} is not a folder` });
    return path;
  });

/**
 * Saves a Harness Account once its name is given, its binary runs and its
 * config folder is a folder; a new one when `input.id` is null.
 */
export const saveAccount = (
  harnesses: ReadonlyArray<Harness>,
  input: AccountInput,
) =>
  Effect.gen(function* () {
    const harness = harnesses.find((each) => each.name === input.harness);
    if (harness === undefined)
      return yield* new InvalidAccount({
        message: `No harness named ${input.harness}`,
      });
    const name = input.name.trim();
    if (name === '')
      return yield* new InvalidAccount({ message: 'Give the account a name' });
    if (input.id !== null) {
      const found = yield* accountOf(harnesses, input.id);
      if (found === undefined || found.harness !== input.harness)
        return yield* new InvalidAccount({
          message: `No ${harness.label} account ${input.id}`,
        });
    }
    const binaryPath =
      input.binaryPath === null
        ? null
        : yield* checkBinary(harness, input.binaryPath);
    const configFolder =
      input.configFolder === null
        ? null
        : yield* checkConfigFolder(input.configFolder);
    const account: HarnessAccountRecord = {
      id: input.id ?? `${input.harness}-${yield* nextUlid}`,
      harness: input.harness,
      name,
      binaryPath,
      configFolder,
      updatedAt: yield* Clock.currentTimeMillis,
    };
    yield* (yield* Store).saveHarnessAccount(account);
    return yield* accountRow(harness, account);
  });

/** Removes a Harness Account the user added; a Default Account stays. */
export const removeAccount = (harnesses: ReadonlyArray<Harness>, id: string) =>
  Effect.gen(function* () {
    if (isDefaultAccount(id))
      return yield* new InvalidAccount({
        message: 'A Default Account cannot be removed',
      });
    const removed = yield* (yield* Store).removeHarnessAccount(id);
    if (!removed)
      return yield* new InvalidAccount({ message: `No Harness Account ${id}` });
  });
