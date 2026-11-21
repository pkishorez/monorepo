import { Effect, Layer, type Scope } from 'effect';
import type { Principal } from '@kestack/auth-toolkit';
import { fakeGuard } from '@kestack/auth-toolkit/fake';
import type { StdTableService } from '@kestack/std-toolkit/db';
import { client as inProcess } from '@kestack/rpc-toolkit/rpc/in-process';
import { versionedClient } from '@kestack/rpc-toolkit/rpc/version-gap';
import { CloudClient } from '../cloud/client/index.js';
import { appHandlers } from '../cloud/worker/app/index.js';
import { heartbeatHandlers } from '../cloud/worker/heartbeat/index.js';
import type { Latest, ReleaseFiles } from '../cloud/worker/store/index.js';
import { AppApi } from '../contracts/app-api/index.js';
import { HeartbeatApi, outdatedLine } from '../contracts/heartbeat/index.js';
import {
  HeartbeatClient,
  Outdated,
} from '../connection/cli/identity/cloud/index.js';

/*
 * Connect Cloud in a tab: its real handlers, `appHandlers` and
 * `heartbeatHandlers`, over its `connections` table on whatever driver the
 * tab keeps it, served in-process.
 *
 * - The App API is behind the Sign-in fake's Guard reading each call's
 *   fake token, which the App's own Accounts sign it with, as a Worker's
 *   Guard reads its cookie: `CloudClient` here takes the place of
 *   `CloudClient.layer(url)`.
 * - Each computer's Heartbeat is behind a Guard that puts its own Sign-in
 *   behind every call, as `ke-connect`'s device sign-in does, and is called
 *   as `ke-connect`'s `HeartbeatClient`: below the Minimum Connect it fails
 *   `Outdated` with the line Connect Cloud answers, before it is read, as
 *   worker.ts answers 426.
 *
 * Every in-process client is built in a Scope that lasts as long as its
 * caller: provided into `versionedClient` alone, it would close at once.
 */

/** What Connect Cloud is deployed with: the latest Release of each Plugin, the Minimum Connect, and the Release Files it keeps. */
export interface CloudOptions {
  readonly wanted?: Latest['wanted'] | undefined;
  readonly minConnect?: string | undefined;
  readonly files?: ReleaseFiles | undefined;
}

/** Connect Cloud over `table`, for as long as the Scope. */
export const cloudOver = (
  table: Layer.Layer<StdTableService<'connections'>>,
  options: CloudOptions,
) =>
  Effect.gen(function* () {
    // Built once: every handler reads and writes the same rows.
    const connections = Layer.succeedContext(yield* Layer.build(table));
    const latest: Latest = {
      wanted: options.wanted ?? {},
      minConnect: options.minConnect ?? null,
    };
    const app = yield* Layer.build(
      inProcess(
        AppApi,
        Layer.mergeAll(
          appHandlers(latest, options.files).pipe(Layer.provide(connections)),
          fakeGuard.rpc(),
        ),
      ),
    );

    /**
     * A computer's Heartbeat client, signed in as `signIn` (nobody when
     * null), called as `ke-connect` at `version`, for as long as the Scope.
     */
    const heartbeat = (
      signIn: Principal | null,
      version: () => string,
    ): Effect.Effect<HeartbeatClient['Service'], never, Scope.Scope> =>
      Effect.gen(function* () {
        const protocol = yield* Layer.build(
          inProcess(
            HeartbeatApi,
            Layer.mergeAll(
              heartbeatHandlers(latest).pipe(Layer.provide(connections)),
              fakeGuard.rpc({ as: signIn }),
            ),
          ),
        );
        const rpc = yield* versionedClient(HeartbeatApi).pipe(
          Effect.provideContext(protocol),
        );
        const gated = <A, E>(
          call: Effect.Effect<A, E>,
        ): Effect.Effect<A, E | Outdated> =>
          Effect.suspend((): Effect.Effect<A, E | Outdated> => {
            const line = outdatedLine(version(), latest.minConnect);
            return line === null ? call : Effect.fail(new Outdated({ line }));
          });
        return HeartbeatClient.of({
          Report: (...args) => gated(rpc.Report(...args)),
          Forget: (...args) => gated(rpc.Forget(...args)),
        });
      });

    return {
      /** Connect Cloud as an App calls it, its calls signed by the App's Accounts. */
      client: Layer.effect(
        CloudClient,
        versionedClient(AppApi).pipe(Effect.provideContext(app)),
      ),
      heartbeat,
    };
  });
