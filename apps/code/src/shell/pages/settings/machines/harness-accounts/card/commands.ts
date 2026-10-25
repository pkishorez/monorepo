import { Effect, Schema } from 'effect';
import { CodeClient, CodeClients, HarnessInfo } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { orRefused } from '../../../../../machines/index.ts';
import { AccountList } from '../capabilities/index.ts';

/*
 * What a card asks of its Machine, over the Machine's own socket; what the
 * Machine did, it also tells the list (AccountList).
 */

/** Saves a Harness Account; a new one when `id` is null. */
export const saveAccount = Command.make('SaveAccount', {
  args: Schema.Struct({
    machineId: Schema.String,
    key: Schema.String,
    id: Schema.NullOr(Schema.String),
    harness: HarnessInfo.fields.harness,
    name: Schema.String,
    binaryPath: Schema.NullOr(Schema.String),
    configFolder: Schema.NullOr(Schema.String),
  }),
  run: ({ machineId, key, ...args }) =>
    orRefused(
      CodeClients.on(
        machineId,
        CodeClient.use((api) => api.saveHarnessAccount(args)),
      ).pipe(
        Effect.tap((account) =>
          Effect.flatMap(AccountList, (list) => list.saved(key, account)),
        ),
      ),
      () => ({ _tag: 'Saved' as const }),
    ),
});

/** Removes an account the user added. */
export const removeAccount = Command.make('RemoveAccount', {
  args: Schema.Struct({ machineId: Schema.String, id: Schema.String }),
  run: ({ machineId, id }) =>
    orRefused(
      CodeClients.on(
        machineId,
        CodeClient.use((api) => api.removeHarnessAccount({ id })),
      ).pipe(
        Effect.tap(() =>
          Effect.flatMap(AccountList, (list) => list.removed(id)),
        ),
      ),
      () => ({ _tag: 'Removed' as const }),
    ),
});

/** Drops the account being added. */
export const cancelAccount = Command.make('CancelAccount', {
  args: Schema.Struct({}),
  run: () => Effect.flatMap(AccountList, (list) => list.cancelled),
});
