import type { Session, User } from 'better-auth';
import { NodeHttpPlatform, NodeServices } from '@effect/platform-node';
import { Effect, Layer, Schema } from 'effect';
import { Etag, HttpRouter } from 'effect/unstable/http';
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiTest,
} from 'effect/unstable/httpapi';
import { describe, expect, it } from 'vitest';

import { Authz } from './authz.js';
import { authzLayer } from './http-api.js';

type Resolve = (typeof Authz.Resolver)['Service']['resolve'];

const requestHeaders = { cookie: Schema.String };

const resolvedAuth = (
  userId = 'u1',
  refreshedCookies: ReadonlyArray<string> = [],
) => ({
  currentAuth: {
    session: { id: `session-${userId}` } as Session,
    user: { id: userId } as User,
  },
  refreshedCookies,
});

const authLayer = (resolve: Resolve) =>
  authzLayer.pipe(
    Layer.provide(
      Layer.succeed(Authz.Resolver, Authz.Resolver.of({ resolve })),
    ),
  );

const TestServices = Layer.mergeAll(
  NodeServices.layer,
  NodeHttpPlatform.layer,
  Etag.layer,
);

const runApi = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  handlers: Layer.Layer<any, never, Layer.Success<typeof authzLayer>>,
  resolve: Resolve,
) =>
  effect.pipe(
    Effect.provide(handlers),
    Effect.provide(authLayer(resolve)),
    Effect.provide(TestServices),
    Effect.scoped,
  );

describe('Effect HTTP API authentication and authorization', () => {
  it('provides CurrentAuth to a protected handler', async () => {
    const WhoAmI = HttpApiEndpoint.get('whoAmI', '/me', {
      headers: requestHeaders,
      success: Schema.String,
    }).pipe(Authz.guard());
    const Private = HttpApiGroup.make('private').add(WhoAmI);
    class Api extends HttpApi.make('current-auth-api').add(Private) {}
    const Handlers = HttpApiBuilder.group(Api, 'private', (handlers) =>
      handlers.handle('whoAmI', () =>
        Effect.map(Authz.CurrentAuth, ({ user }) => user.id),
      ),
    );

    const result = await Effect.runPromise(
      runApi(
        Effect.gen(function* () {
          const client = yield* HttpApiTest.groups(Api, ['private']);
          return yield* client.private.whoAmI({
            headers: { cookie: 'session=valid' },
          });
        }),
        Handlers,
        () => Effect.succeed(resolvedAuth()),
      ),
    );

    expect(result).toBe('u1');
  });

  it('returns typed 401, 403, and 503 failures', async () => {
    const denied = Authz.policy(() => false, 'Administrator required');
    const Private = HttpApiEndpoint.get('private', '/private', {
      headers: requestHeaders,
    }).pipe(Authz.guard());
    const Admin = HttpApiEndpoint.get('admin', '/admin', {
      headers: requestHeaders,
    }).pipe(Authz.guard(denied));
    const Group = HttpApiGroup.make('protected').add(Private, Admin);
    class Api extends HttpApi.make('failures-api').add(Group) {}
    const Handlers = HttpApiBuilder.group(Api, 'protected', (handlers) =>
      handlers
        .handle('private', () => Effect.void)
        .handle('admin', () => Effect.void),
    );
    const call = (endpoint: 'private' | 'admin', resolve: Resolve) =>
      Effect.runPromise(
        runApi(
          Effect.gen(function* () {
            const client = yield* HttpApiTest.groups(Api, ['protected']);
            return yield* Effect.flip(
              client.protected[endpoint]({
                headers: { cookie: 'session=value' },
              }),
            );
          }),
          Handlers,
          resolve,
        ),
      );

    const unauthenticated = await call('private', () => Effect.succeed(null));
    const forbidden = await call('admin', () =>
      Effect.succeed(resolvedAuth('member')),
    );
    const unavailable = await call('private', () =>
      Effect.fail('Auth Worker unavailable'),
    );

    expect(unauthenticated).toBeInstanceOf(Authz.Unauthenticated);
    expect(forbidden).toBeInstanceOf(Authz.Forbidden);
    expect(unavailable).toBeInstanceOf(Authz.VerificationUnavailable);

    const status = async (endpoint: 'private' | 'admin', resolve: Resolve) => {
      const AppLive = HttpApiBuilder.layer(Api).pipe(
        Layer.provide(Handlers),
        Layer.provide(authLayer(resolve)),
        Layer.provide(TestServices),
      );
      const web = HttpRouter.toWebHandler(AppLive, { disableLogger: true });
      const response = await web.handler(
        new Request(`http://localhost/${endpoint}`, {
          headers: { cookie: 'session=value' },
        }),
      );
      await web.dispose();
      return { status: response.status, body: await response.text() };
    };

    await expect(
      status('private', () => Effect.succeed(null)),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      status('admin', () => Effect.succeed(resolvedAuth('member'))),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      status('private', () => Effect.fail('Auth Worker unavailable')),
    ).resolves.toMatchObject({ status: 503 });
  });

  it('uses an endpoint policy instead of the group policy', async () => {
    const calls: string[] = [];
    const groupPolicy = () =>
      Effect.sync(() => {
        calls.push('group');
      });
    const endpointPolicy = () =>
      Effect.sync(() => {
        calls.push('endpoint');
      });
    const Inherited = HttpApiEndpoint.get('inherited', '/inherited', {
      headers: requestHeaders,
    });
    const Overridden = HttpApiEndpoint.get('overridden', '/overridden', {
      headers: requestHeaders,
    }).pipe(Authz.guard(endpointPolicy));
    const Group = HttpApiGroup.make('policies')
      .add(Inherited, Overridden)
      .pipe(Authz.guard(groupPolicy));
    class Api extends HttpApi.make('policies-api').add(Group) {}
    const Handlers = HttpApiBuilder.group(Api, 'policies', (handlers) =>
      handlers
        .handle('inherited', () => Effect.void)
        .handle('overridden', () => Effect.void),
    );

    await Effect.runPromise(
      runApi(
        Effect.gen(function* () {
          const client = yield* HttpApiTest.groups(Api, ['policies']);
          yield* client.policies.inherited({
            headers: { cookie: 'session=valid' },
          });
          yield* client.policies.overridden({
            headers: { cookie: 'session=valid' },
          });
        }),
        Handlers,
        () => Effect.succeed(resolvedAuth()),
      ),
    );

    expect(calls).toEqual(['group', 'endpoint']);
  });

  it('relays every refreshed cookie on the HTTP response', async () => {
    const Cookies = HttpApiEndpoint.get('cookies', '/cookies', {
      headers: requestHeaders,
      success: Schema.String,
    }).pipe(Authz.guard());
    const Group = HttpApiGroup.make('cookieRelay').add(Cookies);
    class Api extends HttpApi.make('cookies-api').add(Group) {}
    const Handlers = HttpApiBuilder.group(Api, 'cookieRelay', (handlers) =>
      handlers.handle('cookies', () => Effect.succeed('ok')),
    );

    const AppLive = HttpApiBuilder.layer(Api).pipe(
      Layer.provide(Handlers),
      Layer.provide(
        authLayer(() =>
          Effect.succeed(
            resolvedAuth('u1', [
              'session=NEW; Path=/; HttpOnly',
              'session=NEW; Path=/admin; HttpOnly',
              'session_cache=NEW; Path=/; HttpOnly',
            ]),
          ),
        ),
      ),
      Layer.provide(TestServices),
    );
    const web = HttpRouter.toWebHandler(AppLive, { disableLogger: true });

    const response = await web.handler(
      new Request('http://localhost/cookies', {
        headers: { cookie: 'session=old' },
      }),
    );
    await web.dispose();

    expect(response.headers.getSetCookie()).toEqual([
      'session=NEW; Path=/; HttpOnly',
      'session=NEW; Path=/admin; HttpOnly',
      'session_cache=NEW; Path=/; HttpOnly',
    ]);
  });
});
