import { Effect, Layer, ManagedRuntime } from 'effect';
import { RpcTest } from 'effect/rpc';
import { Authz } from '@kstackz/auth-toolkit/rpc';
import { authzLayer } from '@kstackz/auth-toolkit/server/rpc';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { memory } from '@kstackz/std-toolkit/sync';
import { type ReactNode, useState } from 'react';
import { Ledger } from '../app/shell/index.ts';
import type { LedgerHost } from '../client/data/index.ts';
import { Rpc, type RpcRuntime, type User } from '../client/session/index.ts';
import { LedgerApi } from '../domain/ledger-api/index.ts';
import { LedgerHandlers } from '../server/ledger/index.ts';
import { ledgerTable } from '../server/storage/index.ts';

const USER: User = {
  id: 'preview',
  name: 'Preview',
  email: 'preview@ledger.local',
  image: null,
};

// The stand-in for the Auth Worker: every call is the preview user's.
const signedIn = Layer.succeed(Authz.Resolver, {
  resolve: () =>
    Effect.succeed({
      currentAuth: {
        kind: 'session',
        user: USER,
        session: { id: 'preview' },
      } as never,
      refreshedCookies: [],
    }),
});

/**
 * The server, in this tab: the real Ledger API and its handlers over a
 * table in memory, for the preview user. Nothing is kept past the tab.
 */
const previewHost = (): LedgerHost => {
  const table = Memory.make(ledgerTable).layer;
  return {
    platform: () => memory(),
    runtime: () =>
      ManagedRuntime.make(
        Layer.effect(Rpc, RpcTest.makeClient(LedgerApi)).pipe(
          Layer.provide(LedgerHandlers),
          Layer.provide(authzLayer.pipe(Layer.provide(signedIn))),
          Layer.provide(table),
        ),
      ) as unknown as RpcRuntime,
  };
};

/** Ledger for a stand-in user, its server in this tab: for trying it out. */
export function PreviewLedger(props: { readonly children: ReactNode }) {
  const [host] = useState(previewHost);
  return (
    <Ledger user={USER} host={host}>
      {props.children}
    </Ledger>
  );
}
