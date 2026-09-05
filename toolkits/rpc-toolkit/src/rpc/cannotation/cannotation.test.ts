import { Context, Effect, Layer, Option, Schema } from 'effect';
import { Headers } from 'effect/unstable/http';
import { Rpc, RpcGroup, RpcTest } from 'effect/unstable/rpc';
import { describe, expect, it } from 'vitest';

import { Cannotation } from './index.js';

class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: string; readonly role: string }
>()('test/CurrentUser') {}

class Forbidden extends Schema.Error<Forbidden>('test/Forbidden')({
  _tag: Schema.tag('Forbidden'),
  reason: Schema.String,
}) {}

type Role = 'admin' | 'user';

const Role = Cannotation.make<Role>()('test/Role', {
  provides: CurrentUser,
  error: Forbidden,
  client: true,
});

const Audit = Cannotation.make<string>()('test/Audit', {
  requires: CurrentUser,
});

const WhoAmI = Rpc.make('WhoAmI', { success: Schema.String });
const Ban = Rpc.make('Ban', { success: Schema.String }).pipe(
  Role.with('admin'),
);
const Users = Role.with('user')(RpcGroup.make(WhoAmI, Ban));

const RoleLive = Role.layer(({ value, headers }) =>
  Effect.gen(function* () {
    const role = headers['x-role'] ?? 'user';
    if (Option.isSome(value) && value.value === 'admin' && role !== 'admin') {
      return yield* new Forbidden({ reason: 'admin only' });
    }
    return { id: headers['x-user'] ?? 'anon', role };
  }),
);

const seen: Array<string> = [];
const AuditLive = Audit.layer(({ value }) =>
  Effect.map(CurrentUser, (user) => {
    seen.push(`${Option.getOrElse(value, () => 'none')}:${user.id}`);
  }),
);

const Handlers = Users.toLayer({
  WhoAmI: () => Effect.map(CurrentUser, (user) => `${user.id}/${user.role}`),
  Ban: () => Effect.succeed('banned'),
});

const clientWithHeaders = (headers: Record<string, string>) =>
  Role.clientLayer(({ request, next }) =>
    next({ ...request, headers: Headers.fromInput(headers) }),
  );

const run = <A, E, R>(
  use: Effect.Effect<A, E, R>,
  headers: Record<string, string>,
) =>
  Effect.runPromise(
    use.pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(Handlers, RoleLive, clientWithHeaders(headers)),
      ),
    ) as Effect.Effect<A, E>,
  );

describe('rpc Cannotation', () => {
  it('reads the nearest value: group value inherited, rpc value kept', () => {
    expect(Role.get(Users.requests.get('WhoAmI')!)).toEqual(
      Option.some('user'),
    );
    expect(Role.get(Users.requests.get('Ban')!)).toEqual(Option.some('admin'));
    expect(Role.get(WhoAmI)).toEqual(Option.none());
  });

  it('provides the declared service to handlers', async () => {
    const result = await run(
      Effect.flatMap(RpcTest.makeClient(Users), (client) => client.WhoAmI()),
      { 'x-user': 'u1', 'x-role': 'user' },
    );
    expect(result).toBe('u1/user');
  });

  it('enforces the rpc-level value over the group value', async () => {
    const denied = await run(
      Effect.flatMap(RpcTest.makeClient(Users), (client) =>
        Effect.flip(client.Ban()),
      ),
      { 'x-user': 'u1', 'x-role': 'user' },
    );
    expect(denied).toBeInstanceOf(Forbidden);

    const allowed = await run(
      Effect.flatMap(RpcTest.makeClient(Users), (client) => client.Ban()),
      { 'x-user': 'u1', 'x-role': 'admin' },
    );
    expect(allowed).toBe('banned');
  });

  it('with() attaches the middleware without setting a value', () => {
    const Open = Rpc.make('Open').pipe(Role.with());
    expect(Role.get(Open)).toEqual(Option.none());
    expect(Open.middlewares.has(Role.middleware)).toBe(true);
  });

  it('a requires-only cannotation sees what an earlier one provided', async () => {
    const Audited = Role.with('user')(
      Audit.with('login')(RpcGroup.make(WhoAmI)),
    );
    const AuditedHandlers = Audited.toLayer({
      WhoAmI: () => Effect.succeed('ok'),
    });

    await Effect.runPromise(
      Effect.flatMap(RpcTest.makeClient(Audited), (client) =>
        client.WhoAmI(),
      ).pipe(
        Effect.scoped,
        Effect.provide(
          Layer.mergeAll(
            AuditedHandlers,
            AuditLive,
            RoleLive,
            clientWithHeaders({ 'x-user': 'u2' }),
          ),
        ),
      ),
    );
    expect(seen).toEqual(['login:u2']);
  });

  it('layer accepts an Effect that builds the implementation', async () => {
    class Greeting extends Context.Service<Greeting, string>()(
      'test/Greeting',
    ) {}
    const Hello = Cannotation.make<string>()('test/Hello', {
      provides: Greeting,
    });
    const Hi = Rpc.make('Hi', { success: Schema.String }).pipe(
      Hello.with('hey'),
    );
    const Group = RpcGroup.make(Hi);
    const HelloLive = Hello.layer(
      Effect.map(
        Greeting,
        (prefix) =>
          ({ value }) =>
            Effect.succeed(`${prefix} ${Option.getOrElse(value, () => '')}`),
      ),
    ).pipe(Layer.provide(Layer.succeed(Greeting, 'well')));

    const result = await Effect.runPromise(
      Effect.flatMap(RpcTest.makeClient(Group), (client) => client.Hi()).pipe(
        Effect.scoped,
        Effect.provide(
          Layer.mergeAll(Group.toLayer({ Hi: () => Greeting }), HelloLive),
        ),
      ),
    );
    expect(result).toBe('well hey');
  });
});
