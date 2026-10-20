import { Effect } from 'effect';
import { expect } from 'vitest';
import { collect, type startConsole, type Visitor } from './console.ts';
import type { fakeGitHub, FakeInstallation, GitHubUser } from './github.ts';

/*
 * A member connecting a GitHub account to Console, the whole round trip: the
 * install URL, GitHub's return from the install, and GitHub naming the user
 * who manages the installation. Answers the connection's ID.
 */

type Console = Awaited<ReturnType<typeof startConsole>>;
/** The fake GitHub, or as much of it as a real one needs: how the install and sign-in are made. */
type GitHub = Pick<ReturnType<typeof fakeGitHub>, 'install' | 'user'>;

const managerOf = (installation: FakeInstallation): GitHubUser =>
  installation.type === 'User'
    ? { login: installation.login }
    : { login: `${installation.login}-owner`, owns: [installation.login] };

const visit = async (
  console_: Console,
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

export const connectGitHub = async (
  console_: Console,
  github: GitHub,
  visitor: Visitor,
  installation: FakeInstallation,
) => {
  const state = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* console_.socket(visitor);
        const url = new URL(
          yield* client['Connections.installUrl']({ returnTo: '/' }),
        );
        return url.searchParams.get('state');
      }),
    ),
  );
  github.install(installation);
  const asked = new URL(
    await visit(console_, visitor, '/github/connected', {
      setup_action: 'install',
      installation_id: installation.id,
      state,
    }),
  );
  await visit(console_, visitor, '/github/authorized', {
    code: github.user(managerOf(installation)),
    state: asked.searchParams.get('state'),
  });
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* console_.socket(visitor);
        const list = yield* collect(client['Connections.list']());
        const connections = yield* list.next;
        const found = connections.find(
          (each) => each.installationId === installation.id,
        );
        if (found === undefined) throw new Error('Not connected.');
        return found.connectionId;
      }),
    ),
  );
};
