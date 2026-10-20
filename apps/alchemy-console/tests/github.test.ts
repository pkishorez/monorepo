import { Effect, Exit, type Scope } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collect, startConsole, type Visitor } from './support/console.ts';
import {
  APP,
  delivery,
  type FakeInstallation,
  fakeGitHub,
} from './support/github.ts';

/*
 * GitHub connections in the Worker as it deploys: GitHub's return from an
 * install, through `/github/connected` and then `/github/authorized`, keeps
 * a connection only for a member whose install it was and whose GitHub user
 * can reach it; signed webhook deliveries reach the installation's owner,
 * and nothing unsigned is read.
 */

const ada = { id: 'local_ada', email: 'ada@demo', name: 'Ada' };
const bob = { id: 'local_bob', email: 'bob@demo', name: 'Bob' };
const cy = { id: 'local_cy', email: 'cy@demo', name: 'Cy' };

const github = fakeGitHub();
let console_: Awaited<ReturnType<typeof startConsole>>;
beforeAll(async () => {
  console_ = await startConsole({
    invites: 'ada@demo, bob@demo, cy@demo',
    outbound: github.outbound,
    app: APP,
  });
});
afterAll(() => console_?.dispose());

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

/** The install URL `visitor`'s Console gives, and the state it carries. */
const installUrl = (visitor: Visitor, returnTo: '/' | '/settings' = '/') =>
  run(
    Effect.gen(function* () {
      const client = yield* console_.socket(visitor);
      const url = new URL(
        yield* client['Connections.installUrl']({ returnTo }),
      );
      return { url, state: url.searchParams.get('state') };
    }),
  );

/** `visitor`'s browser sent to `pathname` with `query`; answers where it is sent on. */
const visit = async (
  visitor: Visitor,
  pathname: string,
  query: Record<string, string | number | null>,
) => {
  const search = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) =>
      value === null ? [] : [[key, String(value)]],
    ),
  );
  const response = await console_.fetch(`${pathname}?${search}`, visitor);
  expect(response.status).toBe(303);
  return response.headers.get('location')!;
};

/** GitHub sending `visitor` back from an install. */
const returnFromInstall = (
  visitor: Visitor,
  query: { installation_id: number; state: string | null },
) => visit(visitor, '/github/connected', { setup_action: 'install', ...query });

/** GitHub answering who `visitor` is, as a user reaching `reachable`, at `asked`, the URL Console sent them to. */
const signInToGitHub = (
  visitor: Visitor,
  asked: string,
  reachable: ReadonlyArray<number>,
) => {
  const url = new URL(asked);
  expect(`${url.origin}${url.pathname}`).toBe(
    'https://github.com/login/oauth/authorize',
  );
  return visit(visitor, '/github/authorized', {
    code: github.user(reachable),
    state: url.searchParams.get('state'),
  });
};

/** The whole round trip: install `installation`, return, and sign in to GitHub as a user who reaches it. */
const connect = async (
  visitor: Visitor,
  installation: FakeInstallation,
  returnTo: '/' | '/settings' = '/',
) => {
  const { state } = await installUrl(visitor, returnTo);
  github.install(installation);
  const asked = await returnFromInstall(visitor, {
    installation_id: installation.id,
    state,
  });
  return signInToGitHub(visitor, asked, [installation.id]);
};

const connectionsOf = (visitor: Visitor) =>
  run(
    Effect.gen(function* () {
      const client = yield* console_.socket(visitor);
      const list = yield* collect(client['Connections.list']());
      return yield* list.next;
    }),
  );

const repositoriesOf = (visitor: Visitor) =>
  run(
    Effect.gen(function* () {
      const client = yield* console_.socket(visitor);
      const list = yield* collect(client['Repositories.list']());
      return (yield* list.next).map((repository) => repository.fullName);
    }),
  );

const deliver = (event: string, payload: unknown, secret?: string) => {
  const signed = delivery(event, payload, secret);
  return console_.fetch('/github/webhook', undefined, signed.headers, {
    method: 'POST',
    body: signed.body,
  });
};

describe('Connect GitHub', () => {
  it('hands out the App’s install URL with a one-time state', async () => {
    const { url, state } = await installUrl(ada);
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://github.com/apps/${APP.slug}/installations/new`,
    );
    expect(state).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('asks GitHub who the member is, as the App, back on this host', async () => {
    const { state } = await installUrl(cy);
    github.install({ id: 404, login: 'cy-x', type: 'User', repositories: [] });
    const asked = new URL(
      await returnFromInstall(cy, { installation_id: 404, state }),
    );
    expect(asked.searchParams.get('client_id')).toBe(APP.clientId);
    expect(asked.searchParams.get('redirect_uri')).toBe(
      new URL('/github/authorized', console_.url).href,
    );
    expect(await console_.indexOwner(404)).toBe(null);
  });

  it('lists the connection, with its repositories, once GitHub sends the member back', async () => {
    expect(
      await connect(ada, {
        id: 173147687,
        login: 'pkishorez',
        type: 'User',
        repositories: ['pkishorez/alchemy-console-sandbox'],
      }),
    ).toBe('/?github=connected');
    expect(await connectionsOf(ada)).toEqual([
      expect.objectContaining({
        installationId: 173147687,
        accountLogin: 'pkishorez',
        accountType: 'User',
        repositoryCount: 1,
      }),
    ]);
    expect(await repositoriesOf(ada)).toEqual([
      'pkishorez/alchemy-console-sandbox',
    ]);
    expect(await console_.indexOwner(173147687)).toBe(ada.id);
  });

  it('draws Welcome as the empty Projects state, and Settings with the connection, once there is one', async () => {
    const welcome = await (await console_.fetch('/', ada)).text();
    expect(welcome).toContain('Create your first project');
    expect(welcome).not.toContain('Connect GitHub');
    const settings = await (await console_.fetch('/settings', ada)).text();
    expect(settings).toContain('pkishorez');
    expect(settings).toContain('1 repository');
    expect(settings).toContain('Add GitHub account');
  });

  it('says what went wrong on the way back from GitHub', async () => {
    const html = await (await console_.fetch('/?github=taken', cy)).text();
    expect(html).toContain('Someone else connected that GitHub account');
  });

  it('lands back on Settings when the install began there', async () => {
    expect(
      await connect(
        cy,
        { id: 401, login: 'cy', type: 'User', repositories: [] },
        '/settings',
      ),
    ).toBe('/settings?github=connected');
  });

  it('lists the repositories of both of a member’s connections', async () => {
    await connect(bob, {
      id: 201,
      login: 'bob',
      type: 'User',
      repositories: ['bob/one'],
    });
    await connect(bob, {
      id: 202,
      login: 'bob-org',
      type: 'Organization',
      repositories: ['bob-org/two', 'bob-org/three'],
    });
    expect(
      (await connectionsOf(bob)).map(({ accountLogin, repositoryCount }) => [
        accountLogin,
        repositoryCount,
      ]),
    ).toEqual([
      ['bob', 1],
      ['bob-org', 2],
    ]);
    expect((await repositoriesOf(bob)).sort()).toEqual([
      'bob-org/three',
      'bob-org/two',
      'bob/one',
    ]);
  });

  it('never lets a second member claim an installation another one connected', async () => {
    await connect(ada, {
      id: 301,
      login: 'ada-org',
      type: 'Organization',
      repositories: ['ada-org/app'],
    });
    // Bob's GitHub user is in the organization too.
    const { state } = await installUrl(bob);
    const asked = await returnFromInstall(bob, { installation_id: 301, state });
    expect(await signInToGitHub(bob, asked, [301])).toBe('/?github=taken');
    expect(await console_.indexOwner(301)).toBe(ada.id);
    expect(
      (await connectionsOf(bob)).map((c) => c.installationId),
    ).not.toContain(301);
  });

  it('claims nothing for an installation the member’s GitHub user can’t reach', async () => {
    // Someone else's installation, its ID put in a return by hand.
    github.install({
      id: 303,
      login: 'someone',
      type: 'User',
      repositories: ['someone/private'],
    });
    const { state } = await installUrl(cy);
    const asked = await returnFromInstall(cy, { installation_id: 303, state });
    expect(await signInToGitHub(cy, asked, [401])).toBe(
      '/?github=unauthorized',
    );
    expect(await console_.indexOwner(303)).toBe(null);
    expect(
      (await connectionsOf(cy)).map((c) => c.installationId),
    ).not.toContain(303);
  });

  it('claims nothing for a return whose state this member’s Console never issued', async () => {
    github.install({ id: 302, login: 'x', type: 'User', repositories: [] });
    const adas = await installUrl(ada);
    // Another member's state, or none.
    expect(
      await returnFromInstall(bob, { installation_id: 302, state: adas.state }),
    ).toBe('/?github=expired');
    expect(
      await returnFromInstall(bob, { installation_id: 302, state: null }),
    ).toBe('/?github=expired');
    // A state used once already.
    const bobs = await installUrl(bob);
    const asked = await returnFromInstall(bob, {
      installation_id: 302,
      state: bobs.state,
    });
    expect(
      await returnFromInstall(bob, { installation_id: 302, state: bobs.state }),
    ).toBe('/?github=expired');
    // The question's state, only for its own installation, and only once.
    const answered = new URL(asked).searchParams.get('state');
    await visit(bob, '/github/authorized', {
      code: github.user([302]),
      state: answered,
    });
    expect(
      await visit(bob, '/github/authorized', {
        code: github.user([302]),
        state: answered,
      }),
    ).toBe('/?github=expired');
    expect(await console_.indexOwner(302)).toBe(bob.id);
  });

  it('says so when GitHub knows no such installation', async () => {
    const { state } = await installUrl(cy);
    expect(await returnFromInstall(cy, { installation_id: 999, state })).toBe(
      '/?github=not-found',
    );
  });

  it('sends a visitor who isn’t signed in to the sign-in screen', async () => {
    const response = await console_.fetch(
      '/github/connected?installation_id=1&setup_action=install',
    );
    expect(response.headers.get('location')).toBe('/');
  });

  it('reads a folder of a connected repository, and no other repository', () =>
    run(
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          connect(cy, {
            id: 402,
            login: 'cy-org',
            type: 'Organization',
            repositories: ['cy-org/app'],
            folders: {
              'cy-org/app/': [
                { name: 'apps', path: 'apps', type: 'dir' },
                { name: 'README.md', path: 'README.md', type: 'file' },
              ],
            },
          }),
        );
        const client = yield* console_.socket(cy);
        const list = yield* collect(client['Connections.list']());
        const connection = (yield* list.next).find(
          (each) => each.installationId === 402,
        )!;
        expect(
          yield* client['Repositories.folders']({
            connectionId: connection.connectionId,
            repo: 'cy-org/app',
            path: '',
          }),
        ).toEqual([
          { name: 'apps', path: 'apps', type: 'dir' },
          { name: 'README.md', path: 'README.md', type: 'file' },
        ]);
        const elsewhere = yield* Effect.exit(
          client['Repositories.folders']({
            connectionId: connection.connectionId,
            repo: 'someone/else',
            path: '',
          }),
        );
        expect(Exit.isFailure(elsewhere)).toBe(true);
      }),
    ));
});

describe('GitHub webhooks', () => {
  it('answers a delivery with a bad signature 401, and reads nothing of it', async () => {
    const response = await deliver(
      'installation',
      { action: 'deleted', installation: { id: 173147687 } },
      'not-the-secret',
    );
    expect(response.status).toBe(401);
    expect(await console_.indexOwner(173147687)).toBe(ada.id);
  });

  it('refreshes a connection’s repositories when they change on GitHub', async () => {
    const installation: FakeInstallation = {
      id: 501,
      login: 'ada-labs',
      type: 'Organization',
      repositories: ['ada-labs/one'],
    };
    await connect(ada, installation);
    installation.repositories.push('ada-labs/two');
    const response = await deliver('installation_repositories', {
      action: 'added',
      installation: { id: 501 },
    });
    expect(response.status).toBe(202);
    expect(
      (await connectionsOf(ada)).find((c) => c.installationId === 501)
        ?.repositoryCount,
    ).toBe(2);
  });

  it('accepts a push for a connected installation and changes nothing', async () => {
    const response = await deliver('push', {
      ref: 'refs/heads/main',
      installation: { id: 173147687 },
    });
    expect(response.status).toBe(202);
    expect((await connectionsOf(ada)).length).toBeGreaterThan(0);
  });

  it('drops a delivery for an installation no one connected', async () => {
    const response = await deliver('push', { installation: { id: 77 } });
    expect(response.status).toBe(202);
  });

  it('removes the connection and its index row on a signed installation.deleted', async () => {
    github.uninstall(173147687);
    const response = await deliver('installation', {
      action: 'deleted',
      installation: { id: 173147687 },
    });
    expect(response.status).toBe(202);
    expect(
      (await connectionsOf(ada)).map((c) => c.installationId),
    ).not.toContain(173147687);
    expect(await console_.indexOwner(173147687)).toBe(null);
  });

  it('forgets a connection the member removes, so it can be connected again', () =>
    run(
      Effect.gen(function* () {
        const client = yield* console_.socket(bob);
        const list = yield* collect(client['Connections.list']());
        const bobs = (yield* list.next).find((c) => c.installationId === 201)!;
        yield* client['Connections.remove']({
          connectionId: bobs.connectionId,
        });
        expect(yield* Effect.promise(() => console_.indexOwner(201))).toBe(
          null,
        );
        expect((yield* list.next).map((c) => c.installationId)).not.toContain(
          201,
        );
      }),
    ));
});
