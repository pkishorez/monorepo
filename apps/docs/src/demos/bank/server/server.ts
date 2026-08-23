import { Effect, Layer, Scope } from 'effect';
import { HttpEffect } from 'effect/unstable/http';
import { RpcServer } from 'effect/unstable/rpc';
import { defaultBroadcaster } from 'std-toolkit/core';
import type { StdTableService } from 'std-toolkit/db';
import {
  BankRpcSerializationLayer,
  BankRpcs,
  Role,
} from '../rpc/contract/index.ts';
import { BankMutationsLive } from '../rpc/mutations/index.ts';
import { BankSubscriptionsLive } from '../rpc/subscriptions/index.ts';

export interface BankServerOptions {
  readonly table: Layer.Layer<StdTableService<'bank'>>;
  /** Resume subscriptions from the hibernation checkpoint — true inside a Durable Object. */
  readonly checkpoint: boolean;
  /** Fix every caller's role; omit when the host resolves Role per connection. */
  readonly role?: typeof Role.Service;
}

export type BankServer = Layer.Layer<
  | Layer.Success<typeof BankMutationsLive>
  | Layer.Success<ReturnType<typeof BankSubscriptionsLive>>
>;

export const makeBankServer = ({
  table,
  checkpoint,
  role,
}: BankServerOptions): BankServer =>
  Layer.mergeAll(BankMutationsLive, BankSubscriptionsLive({ checkpoint })).pipe(
    Layer.provide(
      Layer.mergeAll(
        table,
        defaultBroadcaster,
        role === undefined ? Layer.empty : Layer.succeed(Role, role),
      ),
    ),
  );

export type BankWebHandler = (request: Request) => Promise<Response>;

export const makeBankWebHandler = (server: BankServer): BankWebHandler => {
  const booting = Effect.runPromise(
    RpcServer.toHttpEffect(BankRpcs).pipe(
      Effect.provide(Layer.mergeAll(server, BankRpcSerializationLayer)),
      Effect.provideService(Scope.Scope, Scope.makeUnsafe()),
    ),
  ).then((httpEffect) => HttpEffect.toWebHandler(httpEffect));
  return async (request) => (await booting)(request);
};
