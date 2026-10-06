import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import { Device, Sessions } from '../../domain/machine/index.ts';
import { LedgerPlatform } from '../../platform/index.ts';
import { reconcileCopies } from '../../state/local-copies/index.ts';
import { openSessions } from '../../state/session/index.ts';

/**
 * The Remote Backend, as the app machine needs it: Users signed in through
 * the platform's sign-in, and each Session over HTTP to the Ledger API, with
 * its copy kept where the platform keeps copies, to open offline.
 */
export const remoteBackend = Layer.unwrap(
  Effect.gen(function* () {
    const { storage, lastUser, remote } = yield* LedgerPlatform;

    const device = Layer.succeed(Device, {
      lastUser: lastUser.get,
      setLastUser: lastUser.set,
      keepCopies: (userIds) =>
        Effect.tryPromise(() =>
          reconcileCopies(userIds, {
            list: storage.listCopies,
            remove: storage.deleteCopy,
          }),
        ).pipe(
          Effect.catch((error) => Effect.logWarning('[copies]', error)),
          Effect.asVoid,
        ),
    });

    // The Ledger API at `/rpc`. A call carries its Session's token and never
    // a cookie, which names whoever is active in the browser.
    const connection = RpcClient.layerProtocolHttp({
      url: `${remote.ledgerUrl.replace(/\/$/, '')}/rpc`,
    }).pipe(
      Layer.provide([
        FetchHttpClient.layer.pipe(
          Layer.provide(
            Layer.succeed(FetchHttpClient.RequestInit, {
              credentials: 'omit',
            }),
          ),
        ),
        RpcSerialization.layerNdjson,
      ]),
    );

    return Layer.mergeAll(
      remote.auth,
      device,
      Layer.succeed(Sessions, {
        open: openSessions({ connection, platform: storage.copies }),
      }),
    );
  }),
);
