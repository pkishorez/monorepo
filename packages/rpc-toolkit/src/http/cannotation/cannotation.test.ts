import { NodeHttpPlatform, NodeServices } from '@effect/platform-node';
import { Context, Effect, Layer, Option, Schema } from 'effect';
import { Etag } from 'effect/unstable/http';
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiTest,
} from 'effect/unstable/httpapi';
import { describe, expect, it } from 'vitest';

import { Cannotation } from './index.js';

class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: string; readonly role: string }
>()('test/CurrentUser') {}

class Forbidden extends Schema.Error<Forbidden>('test/Forbidden')(
  { _tag: Schema.tag('Forbidden'), reason: Schema.String },
  { httpApiStatus: 403 },
) {}

type Role = 'admin' | 'user';

const Role = Cannotation.make<Role>()('test/Role', {
  provides: CurrentUser,
  error: Forbidden,
});

const headers = { 'x-user': Schema.String, 'x-role': Schema.String };

const WhoAmI = HttpApiEndpoint.get('whoAmI', '/me', {
  headers,
  success: Schema.String,
});
const Ban = HttpApiEndpoint.post('ban', '/ban', {
  headers,
  success: Schema.String,
}).pipe(Role.with('admin'));
const Users = HttpApiGroup.make('users')
  .add(WhoAmI, Ban)
  .pipe(Role.with('user'));
class Api extends HttpApi.make('api').add(Users) {}

const RoleLive = Role.layer(({ value, request }) =>
  Effect.gen(function* () {
    const role = request.headers['x-role'] ?? 'user';
    if (Option.isSome(value) && value.value === 'admin' && role !== 'admin') {
      return yield* new Forbidden({ reason: 'admin only' });
    }
    return { id: request.headers['x-user'] ?? 'anon', role };
  }),
);

const Handlers = HttpApiBuilder.group(Api, 'users', (handlers) =>
  handlers
    .handle('whoAmI', () =>
      Effect.map(CurrentUser, (user) => `${user.id}/${user.role}`),
    )
    .handle('ban', () => Effect.succeed('banned')),
);

const TestServices = Layer.mergeAll(
  NodeServices.layer,
  NodeHttpPlatform.layer,
  Etag.layer,
);

const run = <A, E, R>(use: Effect.Effect<A, E, R>) =>
  Effect.runPromise(
    use.pipe(
      Effect.provide(Handlers),
      Effect.provide(RoleLive),
      Effect.provide(TestServices),
      Effect.scoped,
    ) as Effect.Effect<A, E>,
  );

describe('http Cannotation', () => {
  it('reads the nearest value: group value inherited, endpoint value kept', () => {
    expect(Role.get(Users.endpoints.whoAmI)).toEqual(Option.some('user'));
    expect(Role.get(Users.endpoints.ban)).toEqual(Option.some('admin'));
    expect(Role.get(WhoAmI)).toEqual(Option.none());
  });

  it('provides the declared service to handlers', async () => {
    const result = await run(
      Effect.gen(function* () {
        const client = yield* HttpApiTest.groups(Api, ['users']);
        return yield* client.users.whoAmI({
          headers: { 'x-user': 'u1', 'x-role': 'user' },
        });
      }),
    );
    expect(result).toBe('u1/user');
  });

  it('enforces the endpoint-level value over the group value', async () => {
    const denied = await run(
      Effect.gen(function* () {
        const client = yield* HttpApiTest.groups(Api, ['users']);
        return yield* Effect.flip(
          client.users.ban({ headers: { 'x-user': 'u1', 'x-role': 'user' } }),
        );
      }),
    );
    expect(denied).toBeInstanceOf(Forbidden);

    const allowed = await run(
      Effect.gen(function* () {
        const client = yield* HttpApiTest.groups(Api, ['users']);
        return yield* client.users.ban({
          headers: { 'x-user': 'u1', 'x-role': 'admin' },
        });
      }),
    );
    expect(allowed).toBe('banned');
  });

  it('with() attaches the middleware without setting a value', () => {
    const Open = HttpApiEndpoint.get('open', '/open').pipe(Role.with());
    expect(Role.get(Open)).toEqual(Option.none());
    expect(Open.middlewares.has(Role.middleware)).toBe(true);
  });
});
