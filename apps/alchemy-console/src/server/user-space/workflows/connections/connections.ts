import { Auth } from '@kestack/auth-toolkit';
import { Effect, Schedule, Stream } from 'effect';
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
 * - installUrl  issues a one-time `install` state and answers with the App's
 *               install URL carrying it;
 * - connect     GitHub's return to `/github/connected`, for this member. An
 *               installation they already have is read again. Any other
 *               needs an `install` state this User Space issued and an
 *               installation GitHub knows; then the member is sent to ask
 *               GitHub who they are, with an `authorize` state for it;
 * - authorize   GitHub's answer at `/github/authorized`: only when the
 *               member's GitHub user manages the installation's account
 *               (is it, or owns the organization), no other Console user
 *               owns it in the connection index, and GitHub still has it,
 *               is the connection kept, with its repositories, and the
 *               index made to name this member its owner;
 * - refresh     reads an installation's account and repositories again,
 *               retrying GitHub a few times, and fails when it can't;
 * - forget      drops a connection and its index row;
 * - list        every connection, now and after each change.
 *
 * A state proves the member started here; only GitHub, asked as their
 * GitHub user, proves the installation is theirs. So a link someone crafted
 * with another account's installation ID claims nothing.
 */

/** How long a state may take to come back. */
const STATE_MINUTES = 60;

export interface ConnectInput {
  readonly userId: string;
  readonly installationId: number;
  readonly state: string | null;
  /** Where GitHub sends the member back after asking who they are. */
  readonly authorizedUrl: string;
}

export interface AuthorizeInput {
  readonly userId: string;
  /** GitHub's code; null when the member declined. */
  readonly code: string | null;
  readonly state: string | null;
  /** The same `authorizedUrl` the question was asked with. */
  readonly authorizedUrl: string;
}

export interface ConnectOutcome {
  readonly returnTo: ReturnTo;
  readonly github: GitHubReturn;
}

/** What `/github/connected` does next: land, or ask GitHub who the member is. */
export type ConnectStep =
  | ({ readonly _tag: 'Done' } & ConnectOutcome)
  | { readonly _tag: 'Authorize'; readonly url: string };

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

/** The installation's account and repositories, as GitHub says now. */
const fetched = (github: GitHub['Service'], installationId: number) =>
  Effect.all(
    [github.installation(installationId), github.repositories(installationId)],
    { concurrency: 2 },
  ).pipe(
    Effect.map(([installation, repositories]) => ({
      installationId,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      avatarUrl: installation.avatarUrl,
      repositories,
    })),
  );

const outcomeOf = (error: GitHubError): GitHubReturn =>
  error.reason === 'not-found'
    ? 'not-found'
    : error.reason === 'refused'
      ? 'unauthorized'
      : 'unreachable';

/** The state `state` names, used up; `fresh` only when it is of `kind` and not too old. */
const taken = (state: string | null, kind: 'install' | 'authorize') =>
  Effect.gen(function* () {
    if (state === null) return { issued: null, fresh: null };
    const issued = yield* (yield* Storage).installStates.take(state);
    const fresh =
      issued !== null &&
      issued.kind === kind &&
      issued.issuedAt > Date.now() - STATE_MINUTES * 60 * 1000
        ? issued
        : null;
    return { issued, fresh };
  });

/**
 * Drops the connection to `installationId` and its index row; under the
 * connections' lock. The row goes first, so a failure leaves the connection
 * there to be removed again.
 */
const dropped = (userId: string, installationId: number) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    yield* (yield* ConnectionIndex).release(installationId, userId);
    const found = yield* storage.connections.byInstallation(installationId);
    if (found !== null) yield* storage.connections.remove(found.connectionId);
  });

/**
 * Keeps this member's connection to `installationId`, unless someone else
 * owns it: under the connections' lock, so two returns for one installation
 * keep one connection. The index row comes first, then GitHub is asked for
 * the installation and its repositories: a change before that is seen here,
 * and one after it is delivered to this member, to be taken in once this is
 * done.
 */
const keep = (userId: string, installationId: number) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const index = yield* ConnectionIndex;
    const github = yield* GitHub;
    return yield* storage.connections.exclusively(
      Effect.gen(function* () {
        const existing =
          yield* storage.connections.byInstallation(installationId);
        if (!(yield* index.claim(installationId, userId)))
          return 'taken' as GitHubReturn;
        const record = yield* fetched(github, installationId).pipe(
          Effect.result,
        );
        if (record._tag === 'Failure') {
          if (existing === null) yield* dropped(userId, installationId);
          return outcomeOf(record.failure);
        }
        const now = Date.now();
        yield* storage.connections.put({
          ...record.success,
          connectionId: existing?.connectionId ?? (yield* nextUlid),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
        return 'connected' as GitHubReturn;
      }),
    );
  });

// GitHub's own trouble passes; a few tries, within a webhook's ten seconds.
const retrying = Schedule.exponential('250 millis');

/** Drops the connection to `installationId`, if this member has one, and its index row. */
export const forget = (userId: string, installationId: number) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    yield* storage.connections.exclusively(dropped(userId, installationId));
  });

/**
 * Reads a connected installation's account and repositories again; forgets
 * it when GitHub no longer knows it, and fails when GitHub can't be asked.
 * Asked and kept under the connections' lock, so an older answer never
 * lands after a newer one.
 */
export const refresh = (userId: string, installationId: number) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const github = yield* GitHub;
    yield* storage.connections.exclusively(
      Effect.gen(function* () {
        const found = yield* storage.connections.byInstallation(installationId);
        if (found === null) return;
        const exit = yield* fetched(github, installationId).pipe(
          Effect.retry({
            schedule: retrying,
            times: 3,
            while: (error) => error.reason === 'unreachable',
          }),
          Effect.result,
        );
        if (exit._tag === 'Failure') {
          if (exit.failure.reason === 'not-found')
            return yield* dropped(userId, installationId);
          return yield* exit.failure;
        }
        yield* storage.connections.put({
          ...found,
          ...exit.success,
          updatedAt: Date.now(),
        });
      }),
    );
  });

/** GitHub's return from an install, for `input.userId`, whose User Space this is. */
export const connect = (input: ConnectInput) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const github = yield* GitHub;
    const { issued, fresh } = yield* taken(input.state, 'install');
    const done = (github: GitHubReturn): ConnectStep => ({
      _tag: 'Done',
      returnTo: issued?.returnTo ?? '/',
      github,
    });

    // One this member already has: GitHub's Configure page comes back here
    // too, without a state. Read it again.
    const existing = yield* storage.connections.byInstallation(
      input.installationId,
    );
    if (existing !== null) {
      const refreshed = yield* refresh(input.userId, input.installationId).pipe(
        Effect.result,
      );
      return done(
        refreshed._tag === 'Failure'
          ? outcomeOf(refreshed.failure)
          : 'connected',
      );
    }
    if (fresh === null) return done('expired');
    const known = yield* github
      .installation(input.installationId)
      .pipe(Effect.result);
    if (known._tag === 'Failure') return done(outcomeOf(known.failure));

    const state = randomState();
    yield* storage.installStates.issue({
      state,
      kind: 'authorize',
      installationId: input.installationId,
      returnTo: fresh.returnTo,
      issuedAt: Date.now(),
    });
    const step: ConnectStep = {
      _tag: 'Authorize',
      url: github.authorizeUrl(state, input.authorizedUrl),
    };
    return step;
  });

/** GitHub's word on who the member is, for `input.userId`, whose User Space this is. */
export const authorize = (input: AuthorizeInput) =>
  Effect.gen(function* () {
    const github = yield* GitHub;
    const { issued, fresh } = yield* taken(input.state, 'authorize');
    const answer = (github: GitHubReturn): ConnectOutcome => ({
      returnTo: issued?.returnTo ?? '/',
      github,
    });
    if (fresh === null || fresh.installationId === null)
      return answer('expired');
    if (input.code === null) return answer('unauthorized');
    const installation = yield* github
      .installation(fresh.installationId)
      .pipe(Effect.result);
    if (installation._tag === 'Failure')
      return answer(outcomeOf(installation.failure));
    const manages = yield* github
      .manages(input.code, input.authorizedUrl, installation.success)
      .pipe(Effect.result);
    if (manages._tag === 'Failure') return answer(outcomeOf(manages.failure));
    if (!manages.success) return answer('unauthorized');
    return answer(yield* keep(input.userId, fresh.installationId));
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
        yield* storage.installStates.issue({
          state,
          kind: 'install',
          installationId: null,
          returnTo,
          issuedAt: now,
        });
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
