import type * as cf from '@cloudflare/workers-types';
import { Effect, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Auth, type Principal } from '@kestack/auth-toolkit';
import { Api } from '../../../define/index.ts';
import { forOwner, liveObject, refusal } from '../live.ts';

// The sign-in service, as the cookie on a socket's upgrade names its
// caller, and an Access Token (`Bearer <scope>`) Ada's OAuth Client.
const signIn = vi.hoisted(() => ({
  revoked: new Set<string>(),
  // The latest Date there is, unless a test says otherwise.
  expiresAt: 8.64e15,
  asked: 0,
}));
vi.mock('@kestack/auth-toolkit/server/http', () => ({
  verify: async (request: Request) => {
    signIn.asked += 1;
    const bearer = request.headers.get('authorization');
    if (bearer !== null) return grantedTo(bearer.slice('Bearer '.length));
    const cookie = request.headers.get('cookie');
    if (cookie === 'down') throw new Error('unreachable');
    return cookie === null || signIn.revoked.has(cookie)
      ? null
      : signedBy(cookie);
  },
}));

const signedBy = (id: string): Principal =>
  ({
    kind: 'session',
    user: { id, email: `${id}@example.com`, name: id },
    session: {
      id: `s-${id}`,
      token: `${id}-token`,
      expiresAt: new Date(signIn.expiresAt),
    },
  }) as unknown as Principal;

const grantedTo = (scope: string): Principal =>
  ({
    kind: 'token',
    user: { id: 'ada', email: 'ada@example.com', name: 'ada' },
    client: { id: 'client' },
    scopes: [scope],
  }) as unknown as Principal;

const Group = RpcGroup.make(
  Rpc.make('Ping', { success: Schema.String }),
  Rpc.make('WhoAmI', { success: Schema.String }).pipe(Auth.required),
  Rpc.make('Write', { success: Schema.String }).pipe(Auth.scope('write')),
);

// A server socket as the runtime hands it over: what it was sent, and its
// notes, which outlive the object's sleep.
const fakeSocket = () => {
  let attachment: unknown = null;
  return {
    sent: [] as string[],
    send(data: string) {
      this.sent.push(data);
    },
    close: () => {},
    serializeAttachment: (value: unknown) => {
      attachment = structuredClone(value);
    },
    deserializeAttachment: () => attachment,
  };
};
type FakeSocket = ReturnType<typeof fakeSocket>;

// A Durable Object's state: its storage a map, and its sockets those it
// accepted.
const stateWith = (stored: Record<string, string>) => {
  const storage = new Map<string, unknown>(Object.entries(stored));
  const sockets: FakeSocket[] = [];
  return {
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => void storage.set(key, value),
      delete: async (keys: string | string[]) => {
        for (const key of [keys].flat()) storage.delete(key);
      },
      list: async ({ prefix }: { prefix: string }) =>
        new Map([...storage].filter(([key]) => key.startsWith(prefix))),
    },
    getWebSockets: () => sockets,
    setWebSocketAutoResponse: () => {},
    acceptWebSocket: (ws: FakeSocket) => void sockets.push(ws),
    sockets,
  } as unknown as cf.DurableObjectState & { sockets: FakeSocket[] };
};

(globalThis as Record<string, unknown>).WebSocketRequestResponsePair ??= class {
  constructor(
    readonly request: string,
    readonly response: string,
  ) {}
};

const Live = liveObject({
  api: Api.websocket(Group, { path: '/live' }),
  backend: () =>
    Group.toLayer({
      Ping: () => Effect.succeed('pong'),
      WhoAmI: () => Effect.map(Auth.User, ({ user }) => user.id),
      Write: () => Effect.succeed('written'),
    }),
  auth: { url: 'https://auth.invalid' },
});

const owned = () =>
  new Live(stateWith({ '@kestack/web-platform/live/owner': 'ada' }), {});

const upgrade = (cookie?: string) =>
  new Request('https://app.test/live', {
    headers: cookie === undefined ? {} : { cookie },
  });

// Node makes no 101 Response, and makes a socket pair only when told how.
const upgrading = () => {
  vi.stubGlobal(
    'Response',
    class extends Response {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        super(body, init?.status === 101 ? { ...init, status: 200 } : init);
      }
    },
  );
  vi.stubGlobal(
    'WebSocketPair',
    class {
      constructor() {
        return [fakeSocket(), fakeSocket()];
      }
    },
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  signIn.revoked.clear();
  signIn.expiresAt = 8.64e15;
});

// Opens a socket on `object` with `headers` on its upgrade.
const open = async (
  object: InstanceType<typeof Live>,
  state: { sockets: FakeSocket[] },
  headers: Record<string, string>,
) => {
  const response = await object.fetch(
    forOwner(new Request('https://app.test/live', { headers }), 'ada'),
  );
  expect(response.status).toBe(200);
  return state.sockets.at(-1)!;
};

// Calls `tag` on `socket`, and what the object answers: the value, or the
// failure's tag.
let calls = 0;
const call = async (
  object: InstanceType<typeof Live>,
  socket: FakeSocket,
  tag: string,
) => {
  const id = String((calls += 1));
  await object.webSocketMessage(
    socket as unknown as cf.WebSocket,
    JSON.stringify({ _tag: 'Request', id, tag, payload: null, headers: [] }),
  );
  return vi.waitFor(() => {
    const exit = socket.sent
      .map((sent) => JSON.parse(sent))
      .find((message) => message._tag === 'Exit' && message.requestId === id);
    if (exit === undefined) throw new Error('no answer yet');
    return exit.exit._tag === 'Success'
      ? exit.exit.value
      : JSON.stringify(exit.exit.cause).match(
          /"_tag":"(Forbidden|Unauthenticated|Unavailable)"/,
        )?.[1];
  });
};

describe('a Live Object', () => {
  it('refuses a socket opened for anyone but its owner', async () => {
    const object = owned();
    expect((await object.fetch(forOwner(upgrade('mary'), 'mary'))).status).toBe(
      403,
    );
    // Not forwarded by the server, so owned by nobody named.
    expect((await object.fetch(upgrade('ada'))).status).toBe(403);
  });

  it("opens no socket without its owner's sign-in on the upgrade", async () => {
    const object = owned();
    expect((await object.fetch(forOwner(upgrade(), 'ada'))).status).toBe(401);
    expect((await object.fetch(forOwner(upgrade('mary'), 'ada'))).status).toBe(
      403,
    );
    expect((await object.fetch(forOwner(upgrade('down'), 'ada'))).status).toBe(
      503,
    );
  });

  it('names the owner itself, whatever the caller sent', () => {
    const request = new Request('https://app.test/live', {
      headers: { 'x-kstack-live-owner': 'mary' },
    });
    expect(forOwner(request, 'ada').headers.get('x-kstack-live-owner')).toBe(
      'ada',
    );
  });

  it('lets a caller in only as the owner, when one is named', () => {
    expect(refusal(signedBy('ada'), 'ada')).toBeNull();
    expect(refusal(signedBy('ada'))).toBeNull();
    expect(refusal(signedBy('mary'), 'ada')?.status).toBe(403);
    expect(refusal(null)?.status).toBe(401);
    expect(refusal('unavailable')?.status).toBe(503);
  });

  it('lets each socket do only what the caller it was opened for may, even after it sleeps', async () => {
    upgrading();
    const state = stateWith({ '@kestack/web-platform/live/owner': 'ada' });
    const object = new Live(state, {});
    const reader = await open(object, state, { authorization: 'Bearer read' });
    const writer = await open(object, state, {
      authorization: 'Bearer write',
    });
    expect(await call(object, reader, 'Write')).toBe('Forbidden');
    expect(await call(object, writer, 'Write')).toBe('written');

    const woken = new Live(state, {});
    expect(await call(woken, reader, 'Write')).toBe('Forbidden');
    expect(await call(woken, writer, 'Write')).toBe('written');
  });

  it('asks the sign-in service again after five minutes, and refuses a Sign-in revoked since', async () => {
    upgrading();
    const state = stateWith({ '@kestack/web-platform/live/owner': 'ada' });
    const object = new Live(state, {});
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const socket = await open(object, state, { cookie: 'ada' });
    expect(await call(object, socket, 'WhoAmI')).toBe('ada');
    signIn.revoked.add('ada');
    // Inside the Cookie Cache's window, nothing is asked.
    signIn.asked = 0;
    expect(await call(object, socket, 'WhoAmI')).toBe('ada');
    expect(signIn.asked).toBe(0);

    clock.mockReturnValue(now + 5 * 60 * 1000);
    expect(await call(object, socket, 'WhoAmI')).toBe('Unauthenticated');
    expect(signIn.asked).toBe(1);
  });

  it('refuses a socket whose Sign-in has run out', async () => {
    upgrading();
    const state = stateWith({ '@kestack/web-platform/live/owner': 'ada' });
    const object = new Live(state, {});
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    signIn.expiresAt = now + 60 * 1000;
    const socket = await open(object, state, { cookie: 'ada' });
    expect(await call(object, socket, 'WhoAmI')).toBe('ada');
    clock.mockReturnValue(now + 61 * 1000);
    expect(await call(object, socket, 'WhoAmI')).toBe('Unauthenticated');
  });

  it('fails a call Unavailable when the sign-in service cannot be asked again', async () => {
    upgrading();
    const state = stateWith({ '@kestack/web-platform/live/owner': 'ada' });
    const object = new Live(state, {});
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const socket = await open(object, state, { cookie: 'ada' });
    clock.mockReturnValue(now + 5 * 60 * 1000);
    // The socket keeps the cookie it was opened with; here the service is
    // down for it.
    vi.spyOn(signIn.revoked, 'has').mockImplementation(() => {
      throw new Error('unreachable');
    });
    expect(await call(object, socket, 'WhoAmI')).toBe('Unavailable');
  });
});
