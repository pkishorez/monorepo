import { Effect, FileSystem, Layer, Path } from 'effect';
import { Etag, HttpPlatform, HttpRouter } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { Authz } from '@kestack/auth-toolkit';
import { auth } from '@kestack/auth-toolkit/server/http';
import { HelloApi } from './contract.ts';

/*
 * The HTTP Worker: answers each level's endpoint, the guarded ones with
 * who called. The caller is read from the session cookie the browser
 * sends, checked with the Auth Worker; a guarded call with none is a 401,
 * and the authorized one from anyone but the owner a 403. The site is on another origin of the
 * same site, so Effect's CORS middleware lets its origin, and only its,
 * call with credentials, and answers the preflight. A Worker has no file
 * system, so the one HttpApi asks for is a stub.
 */

/** What this Worker is handed by Alchemy. */
interface Env {
  readonly AUTH_URL: string;
  readonly SITE_ORIGIN: string;
}

const Greetings = HttpApiBuilder.group(HelloApi, 'greetings', (handlers) =>
  handlers
    .handle('public', () =>
      Effect.succeed('Hello, whoever you are, from the HTTP Worker'),
    )
    .handle('authenticated', () =>
      Effect.map(
        Authz.User,
        ({ user }) => `Hello ${user.name}, signed in, from the HTTP Worker`,
      ),
    )
    .handle('authorized', () =>
      Effect.map(
        Authz.User,
        ({ user }) => `Hello ${user.name}, the owner, from the HTTP Worker`,
      ),
    ),
);

const Platform = Layer.mergeAll(
  Etag.layer,
  Path.layer,
  HttpPlatform.layer.pipe(Layer.provide(FileSystem.layerNoop({}))),
  FileSystem.layerNoop({}),
);

/**
 * Answers requests with `guard` telling who calls, letting `site` call
 * with credentials: `auth({ url })` in the Worker, `testAuth` in a test.
 */
export const serve = (guard: ReturnType<typeof auth>, site: string) =>
  HttpRouter.toWebHandler(
    Layer.mergeAll(
      HttpApiBuilder.layer(HelloApi),
      HttpRouter.cors({ allowedOrigins: [site], credentials: true }),
    ).pipe(
      Layer.provide(Greetings),
      Layer.provide(guard),
      Layer.provide(Platform),
    ),
    { disableLogger: true },
  ).handler;

let served: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch: (request: Request, env: Env) =>
    (served ??= serve(auth({ url: env.AUTH_URL }), env.SITE_ORIGIN))(request),
};
