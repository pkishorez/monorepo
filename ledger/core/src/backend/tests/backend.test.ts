import { Effect, Layer } from 'effect';
import { RpcClient } from 'effect/rpc';
import { localToken, localUser } from '@kstackz/auth-toolkit/clients/auth';
import { Authz } from '@kstackz/auth-toolkit/rpc';
import { resolverLocal } from '@kstackz/auth-toolkit/server/rpc';
import { layerInProcessProtocol } from '@kstackz/rpc-toolkit/rpc/in-process';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { describe, expect, it } from 'vitest';
import { LedgerApi } from '../../api/index.ts';
import { ledgerTable } from '../services/table/index.ts';
import { ledgerBackend } from '../backend.ts';

// The Backend as the device Backend runs it: in this process, for whoever a
// Local Token names. Only the table is in memory here, one for every client.
const connection = Effect.map(
  Layer.build(Memory.make(ledgerTable).layer),
  (table) =>
    layerInProcessProtocol(LedgerApi).pipe(
      Layer.provide(
        ledgerBackend.pipe(
          Layer.provide([Layer.succeedContext(table), resolverLocal]),
        ),
      ),
    ),
);

const tokenOf = (email: string) => localToken.make(localUser({ email }));

// A client signed as `token`, as a Session's is, living as long as the scope.
const clientAs = (
  backend: Effect.Success<typeof connection>,
  token: string | null,
) =>
  Layer.build(
    Layer.mergeAll(
      backend,
      Authz.bearer(() => token),
    ),
  ).pipe(
    Effect.flatMap((context) =>
      RpcClient.make(LedgerApi).pipe(Effect.provideContext(context)),
    ),
  );

describe('the Backend in-process', () => {
  it('answers each User with their own money', async () => {
    const [ada, grace] = await Effect.runPromise(
      Effect.gen(function* () {
        const backend = yield* connection;
        const ada = yield* clientAs(backend, tokenOf('ada@example.com'));
        const grace = yield* clientAs(backend, tokenOf('grace@example.com'));
        yield* ada['Ledger.Sample']({ entries: false });
        return [
          yield* ada['Accounts.Changes']({ after: null }),
          yield* grace['Accounts.Changes']({ after: null }),
        ];
      }).pipe(Effect.scoped),
    );
    expect(ada.length).toBeGreaterThan(0);
    expect(grace).toEqual([]);
  });

  it('refuses a call no Session signed', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const nobody = yield* clientAs(yield* connection, null);
        return yield* Effect.result(
          nobody['Accounts.Changes']({ after: null }),
        );
      }).pipe(Effect.scoped),
    );
    expect(result).toMatchObject({ failure: { _tag: 'Unauthenticated' } });
  });
});
