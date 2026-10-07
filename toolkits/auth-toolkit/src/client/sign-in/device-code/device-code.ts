import {
  Console,
  Context,
  Data,
  Effect,
  FileSystem,
  Layer,
  Path,
} from 'effect';
import { Headers, HttpClient } from 'effect/http';
import { RpcClient } from 'effect/rpc';
import { spawn } from 'node:child_process';
import {
  AuthWorkerRejected,
  AuthWorkerUnreachable,
  AuthWorkerUnavailable,
  DeviceLoginFailed,
  InvalidAuthWorkerResponse,
  makeAuthWorker,
  type AuthWorkerFailure,
  type User,
} from './auth-worker.js';
import { makeSessionStore } from './session-store.js';

export {
  AuthWorkerRejected,
  AuthWorkerUnreachable,
  AuthWorkerUnavailable,
  DeviceLoginFailed,
  InvalidAuthWorkerResponse,
};
export type { AuthWorkerFailure } from './auth-worker.js';

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

export interface DeviceCodeOptions {
  authWorkerUrl: string;
  app: string;
  version?: string | undefined;
}

const make = ({ authWorkerUrl, app, version }: DeviceCodeOptions) =>
  Effect.gen(function* () {
    const authWorker = yield* makeAuthWorker(
      authWorkerUrl,
      version ? `${app}/${version}` : app,
    );
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

    return DeviceCode.of({
      login,
      logout,
      token,
      whoami: Effect.flatMap(token, signedIn),
    });
  });

/** A CLI's sign-in: Device Login (`login`), the token it keeps between runs,
 * who it names, and `logout`. */
export class DeviceCode extends Context.Service<
  DeviceCode,
  {
    readonly login: Effect.Effect<
      User,
      DeviceLoginFailed | AuthWorkerFailure | SignedOut
    >;
    readonly logout: Effect.Effect<void>;
    readonly token: Effect.Effect<string, SignedOut>;
    readonly whoami: Effect.Effect<User, SignedOut | AuthWorkerFailure>;
  }
>()('@kstackz/auth-toolkit/DeviceCode') {
  static readonly layer = (
    config: DeviceCodeOptions,
  ): Layer.Layer<
    DeviceCode,
    never,
    HttpClient.HttpClient | FileSystem.FileSystem | Path.Path
  > => Layer.effect(DeviceCode, make(config));

  /** Signs every RPC call with the kept token. */
  static readonly rpcSession: Layer.Layer<never, SignedOut, DeviceCode> =
    Layer.effect(
      RpcClient.CurrentHeaders,
      Effect.flatMap(DeviceCode, (auth) => auth.token).pipe(
        Effect.map((token) =>
          Headers.fromInput({ authorization: `Bearer ${token}` }),
        ),
      ),
    );
}

/** Sign-in for a CLI by Device Login: the code is shown, approved in a
 * browser, and the token kept for the next run. */
export const deviceCode = (options: DeviceCodeOptions) =>
  DeviceCode.layer(options);
