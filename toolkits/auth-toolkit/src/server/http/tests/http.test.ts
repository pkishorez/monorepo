import { NodeHttpPlatform, NodeServices } from '@effect/platform-node';
import type { Session, User } from 'better-auth';
import { Effect, Layer, Schema } from 'effect';
import { Etag, HttpRouter } from 'effect/http';
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiTest,
} from 'effect/http-api';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createAuthClient: vi.fn(),
}));

vi.mock('better-auth/client', () => ({
  createAuthClient: mocks.createAuthClient,
}));

import { Authz, type Principal } from '../../../auth/index.js';
import { localToken, localUser } from '../../../contract/index.js';
import { auth, testAuth } from '../index.js';

const url = 'https://auth.example.com';
const issuer = `${url}/api/auth`;

const signedIn = (id = 'u1'): Principal => ({
  kind: 'session',
  session: { id: `session-${id}` } as Session,
  user: { id } as User,
});

const TestServices = Layer.mergeAll(
  NodeServices.layer,
  NodeHttpPlatform.layer,
  Etag.layer,
);

/** Serves `Api` with `handlers` and `server`, answering web requests. */
const serve = async <Id extends string, Groups extends HttpApiGroup.Constraint>(
  Api: HttpApi.HttpApi<Id, Groups>,
  handlers: Layer.Layer<any, never, any>,
  server: Layer.Layer<any, never, any>,
  request: Request,
) => {
  const AppLive = HttpApiBuilder.layer(Api).pipe(
    Layer.provide(handlers),
    Layer.provide(server),
    Layer.provide(TestServices),
  );
  const web = HttpRouter.toWebHandler(AppLive as Layer.Layer<never>, {
    disableLogger: true,
  });
  const response = await web.handler(request);
  const body = await response.text();
  await web.dispose();
  return { response, body };
};

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.createAuthClient.mockReset();
  mocks.createAuthClient.mockReturnValue({ getSession: mocks.getSession });
  mocks.getSession.mockResolvedValue({
    data: { session: { id: 's1' }, user: { id: 'u1' } },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('server/http auth', () => {
  it('provides AuthUser to a guarded handler', async () => {
    const WhoAmI = HttpApiEndpoint.get('whoAmI', '/me', {
      success: Schema.String,
    }).pipe(Authz.required);
    const Private = HttpApiGroup.make('private').add(WhoAmI);
    class Api extends HttpApi.make('current-auth-api').add(Private) {}
    const Handlers = HttpApiBuilder.group(Api, 'private', (handlers) =>
      handlers.handle('whoAmI', () =>
        Effect.map(Authz.User, ({ user }) => user.id),
      ),
    );

    const result = await Effect.gen(function* () {
      const client = yield* HttpApiTest.groups(Api, ['private']);
      return yield* client.private.whoAmI();
    }).pipe(
      Effect.provide(Handlers),
      Effect.provide(testAuth(signedIn())),
      Effect.provide(TestServices),
      Effect.scoped,
      Effect.runPromise,
    );

    expect(result).toBe('u1');
  });

  const Private = HttpApiEndpoint.get('private', '/private').pipe(
    Authz.required,
  );
  const Admin = HttpApiEndpoint.get('admin', '/admin').pipe(
    Authz.policy(() => false, 'Administrator required'),
  );
  const Group = HttpApiGroup.make('protected').add(Private, Admin);
  class FailuresApi extends HttpApi.make('failures-api').add(Group) {}
  const FailureHandlers = HttpApiBuilder.group(
    FailuresApi,
    'protected',
    (handlers) =>
      handlers
        .handle('private', () => Effect.void)
        .handle('admin', () => Effect.void),
  );
  const status = async (
    path: string,
    headers: Record<string, string> = { cookie: 'session=value' },
  ) =>
    (
      await serve(
        FailuresApi,
        FailureHandlers,
        auth({ url }),
        new Request(`http://localhost${path}`, { headers }),
      )
    ).response.status;

  it('answers 401, 403, 409 and 503', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: null });
    expect(await status('/private')).toBe(401);
    expect(await status('/admin')).toBe(403);
    expect(
      await status('/private', {
        cookie: 'session=value',
        'expect-user': 'u2',
      }),
    ).toBe(409);
    mocks.getSession.mockResolvedValueOnce({ data: null, error: {} });
    expect(await status('/private')).toBe(503);
  });

  it('runs a cookie call whose expect-user is the Active Account, and ignores it on a bearer call', async () => {
    expect(
      await status('/private', {
        cookie: 'session=value',
        'expect-user': 'u1',
      }),
    ).toBe(204);
    expect(
      await status('/private', {
        authorization: 'Bearer device-token',
        'expect-user': 'u2',
      }),
    ).toBe(204);
  });

  it('uses an endpoint policy instead of the group policy', async () => {
    const calls: string[] = [];
    const Inherited = HttpApiEndpoint.get('inherited', '/inherited');
    const Overridden = HttpApiEndpoint.get('overridden', '/overridden').pipe(
      Authz.policy(() => {
        calls.push('endpoint');
        return true;
      }, 'never'),
    );
    const Policies = HttpApiGroup.make('policies')
      .add(Inherited, Overridden)
      .pipe(
        Authz.policy(() => {
          calls.push('group');
          return true;
        }, 'never'),
      );
    class Api extends HttpApi.make('policies-api').add(Policies) {}
    const Handlers = HttpApiBuilder.group(Api, 'policies', (handlers) =>
      handlers
        .handle('inherited', () => Effect.void)
        .handle('overridden', () => Effect.void),
    );

    await Effect.gen(function* () {
      const client = yield* HttpApiTest.groups(Api, ['policies']);
      yield* client.policies.inherited();
      yield* client.policies.overridden();
    }).pipe(
      Effect.provide(Handlers),
      Effect.provide(testAuth(signedIn())),
      Effect.provide(TestServices),
      Effect.scoped,
      Effect.runPromise,
    );

    expect(calls).toEqual(['group', 'endpoint']);
  });

  it('relays every refreshed cookie on the response', async () => {
    mocks.getSession.mockImplementation(({ fetchOptions }) => {
      const headers = new Headers();
      headers.append('set-cookie', 'session=NEW; Path=/; HttpOnly');
      headers.append('set-cookie', 'session_cache=NEW; Path=/; HttpOnly');
      headers.append('set-cookie', 'session_cache_1=NEW; Path=/; HttpOnly');
      fetchOptions.onSuccess({ response: new Response(null, { headers }) });
      return Promise.resolve({
        data: { session: { id: 's1' }, user: { id: 'u1' } },
      });
    });

    const { response } = await serve(
      FailuresApi,
      FailureHandlers,
      auth({ url }),
      new Request('http://localhost/private', {
        headers: { cookie: 'session=old' },
      }),
    );

    expect(response.headers.getSetCookie()).toEqual([
      'session=NEW; Path=/; HttpOnly',
      'session_cache=NEW; Path=/; HttpOnly',
      'session_cache_1=NEW; Path=/; HttpOnly',
    ]);
  });

  it('reads Local Tokens in Local mode', async () => {
    const token = localToken.make(localUser({ email: 'ada@example.com' }));
    const WhoAmI = HttpApiEndpoint.get('whoAmI', '/me', {
      success: Schema.String,
    });
    const Group = Authz.required(HttpApiGroup.make('local').add(WhoAmI));
    class Api extends HttpApi.make('local-api').add(Group) {}
    const Handlers = HttpApiBuilder.group(Api, 'local', (handlers) =>
      handlers.handle('whoAmI', () =>
        Effect.map(Authz.User, ({ user }) => user.email),
      ),
    );
    const call = (headers: Record<string, string>) =>
      serve(
        Api,
        Handlers,
        auth({ local: true }),
        new Request('http://localhost/me', { headers }),
      );

    const signed = await call({ authorization: `Bearer ${token}` });
    expect(signed.response.status).toBe(200);
    expect(JSON.parse(signed.body)).toBe('ada@example.com');
    expect((await call({ cookie: 'session=abc' })).response.status).toBe(401);
    expect(mocks.createAuthClient).not.toHaveBeenCalled();
  });
});

describe('server/http auth options', () => {
  it('refuses a url with Local mode, and `local: false`', () => {
    expect(() => auth({ url, local: true } as never)).toThrow(/not both/);
    expect(() => auth({ url, local: false } as never)).toThrow(/not both/);
    expect(() => auth({ local: false } as never)).toThrow(/local/);
  });
});

describe('server/http auth with oauth', () => {
  const resource = 'https://mcp.example.com/mcp';
  let privateKey: CryptoKey;
  let jwks: { keys: Record<string, unknown>[] };

  beforeAll(async () => {
    const pair = await generateKeyPair('EdDSA');
    privateKey = pair.privateKey;
    jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }] };
  });

  const mint = (
    claims: Record<string, unknown> = {},
    audience = resource,
    key: CryptoKey = privateKey,
  ) =>
    new SignJWT({
      scope: 'openid notes:read',
      client_id: 'inspector',
      email: 'ada@example.com',
      name: 'Ada',
      ...claims,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('u1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);

  const stubJwks = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(`${issuer}/jwks`);
        return Response.json(jwks);
      }),
    );

  // An MCP server: one endpoint, its tools checking Scopes inside.
  const Mcp = HttpApiEndpoint.post('mcp', '/mcp', {
    success: Schema.Struct({ user: Schema.String, client: Schema.String }),
    error: Authz.Forbidden,
  }).pipe(Authz.required);
  const Notes = HttpApiEndpoint.get('notes', '/notes', {
    success: Schema.String,
  }).pipe(Authz.scope('notes:write'));
  const Group = HttpApiGroup.make('mcp').add(Mcp, Notes);
  class Api extends HttpApi.make('mcp-api').add(Group) {}
  const Handlers = HttpApiBuilder.group(Api, 'mcp', (handlers) =>
    handlers
      .handle('mcp', () =>
        Effect.gen(function* () {
          yield* Authz.scope('notes:read');
          const principal = yield* Authz.User;
          return {
            user: principal.user.email,
            client: principal.kind === 'token' ? principal.client.id : '',
          };
        }),
      )
      .handle('notes', () => Effect.succeed('ok')),
  );
  const call = (request: Request) =>
    serve(
      Api,
      Handlers,
      auth({ url, oauth: { resource, scopes: ['notes:read'] } }),
      request,
    );
  const post = (headers: Record<string, string> = {}) =>
    call(
      new Request('https://mcp.example.com/mcp', { method: 'POST', headers }),
    );

  it('publishes Protected Resource Metadata at both RFC 9728 paths', async () => {
    for (const path of [
      '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/oauth-protected-resource',
    ]) {
      const { response, body } = await call(
        new Request(`https://mcp.example.com${path}`),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(JSON.parse(body)).toEqual({
        resource,
        authorization_servers: [issuer],
        bearer_methods_supported: ['header'],
        scopes_supported: ['notes:read'],
      });
    }
    const preflight = await call(
      new Request(
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
        { method: 'OPTIONS' },
      ),
    );
    expect(preflight.response.status).toBe(204);
    expect(preflight.response.headers.get('access-control-allow-origin')).toBe(
      '*',
    );
  });

  it('challenges a call without a token, naming the metadata URL', async () => {
    mocks.getSession.mockResolvedValue({ data: null });
    const { response } = await post();
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it('hands a valid Access Token to the handler as a Token Principal', async () => {
    stubJwks();
    const { response, body } = await post({
      authorization: `Bearer ${await mint()}`,
    });
    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toEqual({
      user: 'ada@example.com',
      client: 'inspector',
    });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('refuses a token minted for another Resource Server or signed by a stranger', async () => {
    stubJwks();
    mocks.getSession.mockResolvedValue({ data: null });
    const { privateKey: stranger } = await generateKeyPair('EdDSA');
    for (const token of [
      await mint({}, 'https://other.example.com'),
      await mint({}, resource, stranger),
    ]) {
      const { response } = await post({ authorization: `Bearer ${token}` });
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain(
        'resource_metadata=',
      );
    }
  });

  it('answers a missing Scope with insufficient_scope', async () => {
    stubJwks();
    const inHandler = await post({
      authorization: `Bearer ${await mint({ scope: 'openid' })}`,
    });
    expect(inHandler.response.status).toBe(403);
    expect(inHandler.response.headers.get('www-authenticate')).toContain(
      'error="insufficient_scope"',
    );

    const guarded = await call(
      new Request('https://mcp.example.com/notes', {
        headers: { authorization: `Bearer ${await mint()}` },
      }),
    );
    expect(guarded.response.status).toBe(403);
    expect(guarded.response.headers.get('www-authenticate')).toBe(
      'Bearer error="insufficient_scope", scope="notes:write", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it('forbids a browser Sign-in a Scope check', async () => {
    const { response } = await post({ cookie: 'session=abc' });
    expect(response.status).toBe(403);
  });
});
