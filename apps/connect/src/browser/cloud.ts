import { Clock, Effect, Layer, type Scope } from 'effect';
import type { Principal } from '@kestack/auth-toolkit';
import { fakeGuard, fakeSigning } from '@kestack/auth-toolkit/fake';
import type { StdTableService } from '@kestack/std-toolkit/db';
import { client as inProcess } from '@kestack/rpc-toolkit/rpc/in-process';
import { versionedClient } from '@kestack/rpc-toolkit/rpc/version-gap';
import type { CloudClient } from '../cloud/client/index.js';
import { appHandlers } from '../cloud/worker/app/index.js';
import { heartbeatHandlers } from '../cloud/worker/heartbeat/index.js';
import type { Latest, ReleaseFiles } from '../cloud/worker/store/index.js';
import { connections } from '../cloud/worker/store/storage/index.js';
import { AppApi } from '../contracts/app-api/index.js';
import { HeartbeatApi, outdatedLine } from '../contracts/heartbeat/index.js';
import {
  HeartbeatClient,
  Outdated,
} from '../connection/cli/identity/cloud/index.js';

/*
 * Connect Cloud in a tab: its real handlers, `appHandlers` and
 * `heartbeatHandlers`, over its `connections` table on whatever driver the
 * tab keeps it, served in-process. It always answers, deployed with what
 * it is given: the App's Release of each Plugin (`wanted`), the Minimum
 * Connect, and the Release Files it keeps.
 *
 * - The App API is behind the Sign-in fake's Guard reading each call's
 *   fake token, which the App's own Accounts sign it with, as a Worker's
 *   Guard reads its cookie: `CloudClient` here takes the place of
 *   `CloudClient.layer(url)`.
 * - Each computer's Heartbeat is behind a Guard that puts its own Sign-in
 *   behind every call, as `ke-connect`'s device sign-in does, and is called
 *   as `ke-connect`'s `HeartbeatClient`, signed as that Sign-in too
 *   (`fakeSigning`), never as the tab's Active Account, so nobody signed in
 *   here signs a computer out: below the Minimum Connect it fails
 *   `Outdated` with the line Connect Cloud answers, before it is read, as
 *   worker.ts answers 426.
 * - `pushBack` sets a Connection's Last Seen back, as if it had been
 *   silent that long: what a computer gone offline a while ago looks like.
 *   It never moves it later, so a reload over kept tables keeps it.
 *
 * Every in-process client is built in a Scope that lasts as long as its
 * caller: provided into `versionedClient` alone, it would close at once.
 */

/** What Connect Cloud is deployed with: the App's Release of each Plugin, the Minimum Connect, and the Release Files it keeps. */
export interface CloudOptions {
  readonly wanted?: Latest['wanted'] | undefined;
  readonly minConnect?: string | undefined;
  readonly files?: ReleaseFiles | undefined;
}

/** Connect Cloud over `table`, deployed with `options`, for as long as the Scope. */
export const cloudOver = (
  table: Layer.Layer<StdTableService<'connections'>>,
  options: CloudOptions,
) =>
  Effect.gen(function* () {
    // Built once: every handler reads and writes the same rows.
    const rows = yield* Layer.build(table);
    const connectionsLayer = Layer.succeedContext(rows);
    const latest: Latest = {
      wanted: options.wanted ?? {},
      minConnect: options.minConnect ?? null,
    };

    const app = yield* Layer.build(
      inProcess(
        AppApi,
        Layer.mergeAll(
          appHandlers(latest, options.files).pipe(
            Layer.provide(connectionsLayer),
          ),
          fakeGuard.rpc(),
        ),
      ),
    );
    const cloud: CloudClient['Service'] = yield* versionedClient(AppApi).pipe(
      Effect.provideContext(app),
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
              heartbeatHandlers(latest).pipe(Layer.provide(connectionsLayer)),
              fakeGuard.rpc({ as: signIn }),
            ),
          ),
        );
        const beat = yield* versionedClient(HeartbeatApi).pipe(
          Effect.provideContext(protocol),
          Effect.provide(fakeSigning(signIn)),
        );
        const gated = <A, E>(
          call: () => Effect.Effect<A, E>,
        ): Effect.Effect<A, E | Outdated> =>
          Effect.suspend((): Effect.Effect<A, E | Outdated> => {
            const line = outdatedLine(version(), latest.minConnect);
            return line === null ? call() : Effect.fail(new Outdated({ line }));
          });
        return HeartbeatClient.of({
          Report: (...args) => gated(() => beat.Report(...args)),
          Forget: (...args) => gated(() => beat.Forget(...args)),
        });
      });

    /**
     * Sets Connection `id`'s Last Seen `by` milliseconds back from now,
     * never later than it is: a tab that starts again over kept tables
     * pushes again, and keeps the older one. Nothing for one never reported.
     */
    const pushBack = (id: string, by: number) =>
      Effect.gen(function* () {
        const at = (yield* Clock.currentTimeMillis) - by;
        yield* connections.getAndUpdate({ id }, ({ lastSeen }) => ({
          lastSeen: Math.min(lastSeen, at),
        }));
      }).pipe(
        Effect.provideContext(rows),
        Effect.catchCause(() => Effect.void),
      );

    return {
      /** Connect Cloud as an App calls it, its calls signed by the App's Accounts. */
      client: cloud,
      heartbeat,
      pushBack,
    };
  });
