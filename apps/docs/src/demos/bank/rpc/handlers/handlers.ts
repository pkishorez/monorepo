import { Effect, Layer, Scope } from 'effect';
import { HttpEffect } from 'effect/unstable/http';
import { RpcServer } from 'effect/unstable/rpc';
import type { StdTableService } from 'std-toolkit/db';
import {
  listAccounts,
  openAccount,
} from '../../orchestrator/accounts/index.ts';
import { seedBankIfEmpty } from '../../orchestrator/seed/index.ts';
import {
  listAllTransfers,
  listTransfers,
  transfer,
} from '../../orchestrator/transfers/index.ts';
import { BankRpcSerializationLayer, BankRpcs } from '../contract/index.ts';

export const BankHandlersLive = BankRpcs.toLayer({
  listAccounts: ({ cursor }) => listAccounts(cursor),
  openAccount: ({ id, name, balance }) => openAccount({ id, name, balance }),
  transfer: ({ id, from, to, amount }) => transfer({ id, from, to, amount }),
  listTransfers: ({ account, direction, cursor }) =>
    listTransfers(account, direction, cursor),
  listAllTransfers: ({ cursor }) => listAllTransfers(cursor),
  seed: () => seedBankIfEmpty,
});

export const makeBankFetch = (
  table: Layer.Layer<StdTableService<'bank'>>,
): ((request: Request) => Promise<Response>) => {
  const services = Layer.mergeAll(
    BankHandlersLive.pipe(Layer.provide(table)),
    BankRpcSerializationLayer,
  );
  const booting = Effect.runPromise(
    RpcServer.toHttpEffect(BankRpcs).pipe(
      Effect.provide(services),
      Effect.provideService(Scope.Scope, Scope.makeUnsafe()),
    ),
  ).then((httpEffect) => HttpEffect.toWebHandler(httpEffect));
  return async (request) => (await booting)(request);
};
