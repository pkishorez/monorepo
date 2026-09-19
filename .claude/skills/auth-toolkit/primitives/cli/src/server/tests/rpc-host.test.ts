import { CliAuth } from 'auth-toolkit/cli';
import { Authz } from 'auth-toolkit/rpc';
import { authzLayer } from 'auth-toolkit/rpc/server';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { describe, expect, it } from 'vitest';
import { GreetingRpc, greetingRpc } from '../../cli/client.ts';
import { createRpcHost } from '../rpc-host/index.ts';

const ada = { id: 'u1', email: 'ada@example.com', name: 'Ada' };

const resolver = Layer.succeed(
  Authz.Resolver,
  Authz.Resolver.of({
    resolve: (request) =>
      Effect.succeed(
        request.headers.get('authorization') === 'Bearer tok'
          ? {
              currentAuth: {
                kind: 'session',
                user: ada,
                session: { id: 's1' },
              } as never,
              refreshedCookies: [],
            }
          : null,
      ),
  }),
);

const host = createRpcHost({
  authWorkerUrl: 'https://auth.example.com',
  rpcPath: '/rpc/greeting',
  authz: authzLayer.pipe(Layer.provide(resolver)),
});

const through = <A, E>(
  token: string,
  use: (rpc: GreetingRpc['Service']) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.flatMap(GreetingRpc, use).pipe(
      Effect.provide(greetingRpc('https://cli.example.com')),
      Effect.provide(
        Layer.succeed(
          CliAuth,
          CliAuth.of({
            token: Effect.succeed(token),
            login: Effect.die('unused'),
            logout: Effect.void,
            whoami: Effect.die('unused'),
          }),
        ),
      ),
      Effect.provide(
        FetchHttpClient.layer.pipe(
          Layer.provide(
            Layer.succeed(FetchHttpClient.Fetch, (input, init) =>
              host(new Request(input, init)),
            ),
          ),
        ),
      ),
    ),
  );

describe('the CLI against its server', () => {
  it('describes itself at / and knows nothing else', async () => {
    const landing = await host(new Request('https://cli.example.com/'));
    expect(await landing.text()).toContain('/rpc/greeting');
    const other = await host(new Request('https://cli.example.com/nope'));
    expect(other.status).toBe(404);
  });

  it('sees the Session the CLI attaches to every RPC', async () => {
    expect(await through('tok', (rpc) => rpc.WhoAmI())).toEqual({
      kind: 'session',
      user: ada,
    });
    expect(await through('tok', (rpc) => rpc.Hello({ name: 'Bob' }))).toBe(
      'Hello, Bob. You are signed in as ada@example.com.',
    );
  });

  it('refuses a call without a live Session', async () => {
    expect(
      await through('dead', (rpc) => Effect.flip(rpc.WhoAmI())),
    ).toMatchObject({ _tag: 'Unauthenticated' });
  });
});
