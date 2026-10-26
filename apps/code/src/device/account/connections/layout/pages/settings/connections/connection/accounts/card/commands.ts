import { Effect, Schema, Stream } from 'effect';
import {
  CodeClient,
  CodeClients,
  HarnessAccountInfo,
  HarnessInfo,
} from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import {
  type SetupChange,
  Connections,
} from '../../../../../../../connections.ts';
import { orRefused } from '../../../../../../../connection/link/index.ts';
import { AccountList } from '../store.ts';

/*
 * What a card asks of its Connection, over the Connection's own socket; what the
 * Connection did, it tells the Connection's setup, and once the setup shows it, the
 * list (AccountList), which closes the card.
 */

const same = Schema.toEquivalence(HarnessAccountInfo.schema);

/** Tells the setup what the Connection did, and waits until it shows it. */
const told = (
  connectionId: string,
  change: SetupChange,
  shows: (accounts: ReadonlyArray<HarnessAccountInfo>) => boolean,
) =>
  Effect.flatMap(Connections, (connections) =>
    connections.changed(connectionId, change).pipe(
      Effect.andThen(
        connections.setup(connectionId).pipe(
          Stream.filter((setup) => shows(setup?.accounts ?? [])),
          Stream.runHead,
        ),
      ),
    ),
  );

/** Saves a Harness Account; a new one when `id` is null. */
export const saveAccount = Command.make('SaveAccount', {
  args: Schema.Struct({
    connectionId: Schema.String,
    key: Schema.String,
    id: Schema.NullOr(Schema.String),
    harness: HarnessInfo.fields.harness,
    name: Schema.String,
    binaryPath: Schema.NullOr(Schema.String),
    configFolder: Schema.NullOr(Schema.String),
  }),
  run: ({ connectionId, key, ...args }) =>
    orRefused(
      CodeClients.on(
        connectionId,
        CodeClient.use((api) => api.saveHarnessAccount(args)),
      ).pipe(
        Effect.tap((account) =>
          told(connectionId, { _tag: 'AccountSaved', account }, (accounts) =>
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
  args: Schema.Struct({ connectionId: Schema.String, id: Schema.String }),
  run: ({ connectionId, id }) =>
    orRefused(
      CodeClients.on(
        connectionId,
        CodeClient.use((api) => api.removeHarnessAccount({ id })),
      ).pipe(
        Effect.tap(() =>
          told(
            connectionId,
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
