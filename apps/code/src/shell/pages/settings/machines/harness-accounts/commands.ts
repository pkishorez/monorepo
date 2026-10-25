import { Effect, Schema } from 'effect';
import { CodeClient, CodeClients, HarnessInfo } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { orRefused } from '../../../../machines/index.ts';

/*
 * What a Machine's Harness Accounts ask of it, over its own socket. `key`
 * names the card asking: an account's id, or `new` for the one being added.
 */

/** Saves a Harness Account; a new one when `id` is null. */
export const saveHarnessAccount = Command.make('SaveHarnessAccount', {
  args: Schema.Struct({
    machineId: Schema.String,
    key: Schema.String,
    id: Schema.NullOr(Schema.String),
    harness: HarnessInfo.fields.name,
    name: Schema.String,
    binaryPath: Schema.NullOr(Schema.String),
    home: Schema.NullOr(Schema.String),
  }),
  run: ({ machineId, key, ...args }) =>
    orRefused(
      CodeClients.on(
        machineId,
        CodeClient.use((api) => api.saveHarnessAccount(args)),
      ),
      (account) => ({ _tag: 'AccountSaved' as const, key, account }),
    ).pipe(
      Effect.map((result) =>
        result._tag === 'Refused'
          ? { _tag: 'AccountRefused' as const, key, reason: result.reason }
          : result,
      ),
    ),
});

/** Removes an account the user added. */
export const removeHarnessAccount = Command.make('RemoveHarnessAccount', {
  args: Schema.Struct({ machineId: Schema.String, id: Schema.String }),
  run: ({ machineId, id }) =>
    orRefused(
      CodeClients.on(
        machineId,
        CodeClient.use((api) => api.removeHarnessAccount({ id })),
      ),
      () => ({ _tag: 'AccountRemoved' as const, id }),
    ).pipe(
      Effect.map((result) =>
        result._tag === 'Refused'
          ? { _tag: 'AccountRefused' as const, key: id, reason: result.reason }
          : result,
      ),
    ),
});
