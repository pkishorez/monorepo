import { Effect, Schema, Stream } from 'effect';
import {
  CodeClient,
  CodeClients,
  HarnessAccountInfo,
  HarnessInfo,
} from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { type SetupChange, Machines } from '../../../../../../../machines.ts';
import { orRefused } from '../../../../../../../machine/connection/index.ts';
import { AccountList } from '../store.ts';

/*
 * What a card asks of its Machine, over the Machine's own socket; what the
 * Machine did, it tells the Machine's setup, and once the setup shows it, the
 * list (AccountList), which closes the card.
 */

const same = Schema.toEquivalence(HarnessAccountInfo);

/** Tells the setup what the Machine did, and waits until it shows it. */
const told = (
  machineId: string,
  change: SetupChange,
  shows: (accounts: ReadonlyArray<HarnessAccountInfo>) => boolean,
) =>
  Effect.flatMap(Machines, (machines) =>
    machines.changed(machineId, change).pipe(
      Effect.andThen(
        machines.setup(machineId).pipe(
          Stream.filter((setup) => shows(setup?.accounts ?? [])),
          Stream.runHead,
        ),
      ),
    ),
  );

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
          told(machineId, { _tag: 'AccountSaved', account }, (accounts) =>
            accounts.some((each) => same(each, account)),
          ),
        ),
        Effect.tap(() =>
          Effect.flatMap(AccountList, (list) => list.closed(key)),
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
          told(
            machineId,
            { _tag: 'AccountRemoved', id },
            (accounts) => !accounts.some((each) => each.id === id),
          ),
        ),
        Effect.tap(() =>
          Effect.flatMap(AccountList, (list) => list.closed(id)),
        ),
      ),
      () => ({ _tag: 'Removed' as const }),
    ),
});

/** Closes the card, dropping it if it is the account being added. */
export const closeAccount = Command.make('CloseAccount', {
  args: Schema.Struct({ key: Schema.String }),
  run: ({ key }) => Effect.flatMap(AccountList, (list) => list.closed(key)),
});
