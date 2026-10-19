import { Auth } from '@kestack/auth-toolkit';
import { Effect, Stream } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import {
  type GitHubConnection,
  GitHubError,
  type GitHubReturn,
  type ReturnTo,
} from '../../../../shared/contracts/github/index.ts';
import { ConnectionIndex } from '../../../connection-index/index.ts';
import { GitHub } from '../../services/github/index.ts';
import { Storage } from '../../services/storage/index.ts';

/*
 * GitHub connections: how one is made, kept fresh, and forgotten.
 *
 * - installUrl  issues a one-time `state` and answers with the App's install
 *               URL carrying it;
 * - connect     GitHub's return to `/github/connected`, for this member:
 *               the state must be one this User Space issued, GitHub must
 *               know the installation, and no other user may own it in the
 *               connection index; then the connection is kept with its
 *               repositories, and the index names this member its owner;
 * - refresh     reads an installation's account and repositories again;
 * - forget      drops a connection and its index row;
 * - list        every connection, now and after each change.
 *
 * Only a state issued here can claim an installation no one in Console has
 * connected yet, so a link someone else crafted can't. A return without one
 * (GitHub's "Configure" page sends none) only refreshes an installation
 * this member already has.
 */

/** How long an install URL may take to come back. */
const STATE_MINUTES = 60;
// GitHub's clock and ours may disagree a little.
const SKEW = 60 * 1000;

export interface ConnectInput {
  readonly userId: string;
  readonly installationId: number;
  /** GitHub's `setup_action`: `install` for a new installation, `update` for a changed one. */
  readonly setupAction: string;
  readonly state: string | null;
}

export interface ConnectOutcome {
  readonly returnTo: ReturnTo;
  readonly github: GitHubReturn;
}

type Stored = Effect.Success<Storage['Service']['connections']['all']>[number];

/** What the browser sees of a connection. */
const summaryOf = (stored: Stored): GitHubConnection => ({
  connectionId: stored.connectionId,
  installationId: stored.installationId,
  accountLogin: stored.accountLogin,
  accountType: stored.accountType,
  avatarUrl: stored.avatarUrl,
  repositoryCount: stored.repositories.length,
});

const randomState = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/** Reads the installation and its repositories again, keeping them on `connectionId`. */
const fetched = (
  github: GitHub['Service'],
  installationId: number,
  connectionId: string,
  createdAt: number,
) =>
  Effect.gen(function* () {
    const [installation, repositories] = yield* Effect.all(
      [
        github.installation(installationId),
        github.repositories(installationId),
      ],
      { concurrency: 2 },
    );
    return {
      connectionId,
      installationId,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      avatarUrl: installation.avatarUrl,
      repositories,
      createdAt,
      updatedAt: Date.now(),
      installedAt: installation.createdAt,
    };
  });

const outcomeOf = (error: GitHubError): GitHubReturn =>
  error.reason === 'not-found' ? 'not-found' : 'unreachable';

/** Drops the connection to `installationId`, if this member has one, and its index row. */
export const forget = (userId: string, installationId: number) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const index = yield* ConnectionIndex;
    yield* storage.connections.exclusively(
      Effect.gen(function* () {
        const found = yield* storage.connections.byInstallation(installationId);
        if (found !== null)
          yield* storage.connections.remove(found.connectionId);
        yield* index.release(installationId, userId);
      }),
    );
  });

/** Reads a connected installation's account and repositories again; forgets it when GitHub no longer knows it. */
export const refresh = (userId: string, installationId: number) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const github = yield* GitHub;
    const found = yield* storage.connections.byInstallation(installationId);
    if (found === null) return;
    const exit = yield* fetched(
      github,
      installationId,
      found.connectionId,
      found.createdAt,
    ).pipe(Effect.result);
    if (exit._tag === 'Failure') {
      if (exit.failure.reason === 'not-found')
        yield* forget(userId, installationId);
      return;
    }
    const { installedAt: _, ...record } = exit.success;
    yield* storage.connections.exclusively(
      Effect.gen(function* () {
        // Forgotten meanwhile: stays forgotten.
        if ((yield* storage.connections.get(found.connectionId)) !== null)
          yield* storage.connections.put(record);
      }),
    );
  });

/** GitHub's return from an install, for `input.userId`, whose User Space this is. */
export const connect = (input: ConnectInput) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const github = yield* GitHub;
    const index = yield* ConnectionIndex;
    const now = Date.now();
    const issued =
      input.state === null
        ? null
        : yield* storage.installStates.take(input.state);
    const fresh =
      issued !== null && issued.issuedAt > now - STATE_MINUTES * 60 * 1000
        ? issued
        : null;
    const returnTo = fresh?.returnTo ?? issued?.returnTo ?? '/';
    const answer = (github: GitHubReturn): ConnectOutcome => ({
      returnTo,
      github,
    });

    const existing = yield* storage.connections.byInstallation(
      input.installationId,
    );
    if (existing === null && fresh === null) return answer('expired');

    const connectionId = existing?.connectionId ?? (yield* nextUlid);
    const exit = yield* fetched(
      github,
      input.installationId,
      connectionId,
      existing?.createdAt ?? now,
    ).pipe(Effect.result);
    if (exit._tag === 'Failure') return answer(outcomeOf(exit.failure));
    const { installedAt, ...record } = exit.success;
    // A new installation is newer than the URL that led to it, so an older
    // one can't be claimed with a state issued for something else.
    if (
      existing === null &&
      input.setupAction === 'install' &&
      fresh !== null &&
      installedAt < fresh.issuedAt - SKEW
    )
      return answer('expired');

    return yield* storage.connections.exclusively(
      Effect.gen(function* () {
        if (!(yield* index.claim(input.installationId, input.userId)))
          return answer('taken');
        yield* storage.connections.put(record);
        return answer('connected');
      }),
    );
  });

/** The handlers, for the composition root to serve under `ConsoleApi`. */
export const connectionsHandlers = Effect.gen(function* () {
  const storage = yield* Storage;
  const github = yield* GitHub;
  const context = yield* Effect.context<Storage | GitHub | ConnectionIndex>();
  return {
    'Connections.list': () =>
      storage.connections.changes.pipe(Stream.map((all) => all.map(summaryOf))),
    'Connections.installUrl': ({ returnTo }: { readonly returnTo: ReturnTo }) =>
      Effect.gen(function* () {
        const now = Date.now();
        yield* storage.installStates.sweep(now - STATE_MINUTES * 60 * 1000);
        const state = randomState();
        yield* storage.installStates.issue({ state, returnTo, issuedAt: now });
        return github.installUrl(state);
      }),
    'Connections.remove': ({
      connectionId,
    }: {
      readonly connectionId: string;
    }) =>
      Effect.gen(function* () {
        const principal = yield* Auth.User;
        const found = yield* storage.connections.get(connectionId);
        if (found === null)
          return yield* new GitHubError({
            reason: 'not-found',
            message: 'That GitHub connection no longer exists.',
          });
        yield* forget(principal.user.id, found.installationId).pipe(
          Effect.provideContext(context),
        );
      }),
  };
});
