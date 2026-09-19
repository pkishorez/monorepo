import {
  Console,
  Context,
  Data,
  Effect,
  FileSystem,
  Layer,
  Path,
} from 'effect';
import { Headers, HttpClient, HttpClientError } from 'effect/unstable/http';
import { RpcClient } from 'effect/unstable/rpc';
import { spawn } from 'node:child_process';
import { DeviceLoginFailed, makeAuthWorker, type User } from './auth-worker.js';
import { makeSessionStore } from './session-store.js';

export { DeviceLoginFailed };

export class SignedOut extends Data.TaggedError('SignedOut') {
  override get message() {
    return 'Not signed in. Run login first.';
  }
}

const openBrowser = (url: string) =>
  Effect.sync(() => {
    if (!process.stdout.isTTY) return;
    const [file, args] =
      process.platform === 'darwin'
        ? ['open', [url]]
        : process.platform === 'win32'
          ? ['cmd', ['/c', 'start', '', url]]
          : ['xdg-open', [url]];
    spawn(file, args, { detached: true, stdio: 'ignore' })
      .on('error', () => undefined)
      .unref();
  });

const make = ({ authWorkerUrl, app }: { authWorkerUrl: string; app: string }) =>
  Effect.gen(function* () {
    const authWorker = yield* makeAuthWorker(authWorkerUrl);
    const store = yield* makeSessionStore(app, authWorkerUrl);

    const token = store.read.pipe(
      Effect.flatMap((token) =>
        token ? Effect.succeed(token) : Effect.fail(new SignedOut()),
      ),
    );

    const signedIn = (token: string) =>
      authWorker
        .user(token)
        .pipe(
          Effect.flatMap((user) =>
            user ? Effect.succeed(user) : Effect.fail(new SignedOut()),
          ),
        );

    const login = Effect.gen(function* () {
      const code = yield* authWorker.deviceCode(app);
      yield* Console.error(
        `Confirm the code ${code.user_code} at ${code.verification_uri_complete}`,
      );
      yield* openBrowser(code.verification_uri_complete);
      const issued = yield* authWorker.deviceToken(app, code);
      yield* store.write(issued);
      return yield* signedIn(issued);
    });

    const logout = store.read.pipe(
      Effect.flatMap((token) =>
        token ? authWorker.signOut(token) : Effect.void,
      ),
      Effect.andThen(store.clear),
    );

    return CliAuth.of({
      login,
      logout,
      token,
      whoami: Effect.flatMap(token, signedIn),
    });
  });

export class CliAuth extends Context.Service<
  CliAuth,
  {
    readonly login: Effect.Effect<
      User,
      DeviceLoginFailed | HttpClientError.HttpClientError | SignedOut
    >;
    readonly logout: Effect.Effect<void>;
    readonly token: Effect.Effect<string, SignedOut>;
    readonly whoami: Effect.Effect<
      User,
      SignedOut | HttpClientError.HttpClientError
    >;
  }
>()('auth-toolkit/CliAuth') {
  static readonly layer = (config: {
    authWorkerUrl: string;
    app: string;
  }): Layer.Layer<
    CliAuth,
    never,
    HttpClient.HttpClient | FileSystem.FileSystem | Path.Path
  > => Layer.effect(CliAuth, make(config));

  static readonly rpcSession: Layer.Layer<never, SignedOut, CliAuth> =
    Layer.effect(
      RpcClient.CurrentHeaders,
      Effect.flatMap(CliAuth, (auth) => auth.token).pipe(
        Effect.map((token) =>
          Headers.fromInput({ authorization: `Bearer ${token}` }),
        ),
      ),
    );
}
