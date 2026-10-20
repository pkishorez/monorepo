import { Context, Effect, Layer, Schema } from 'effect';
import {
  AccountType,
  type FolderEntry,
  GitHubError,
} from '../../../../shared/contracts/github/index.ts';
import { call, type Fetch, folderPath, notFound, repoPath } from './api.ts';
import { appJwt, signingKey } from './jwt.ts';

/*
 * The GitHub App, as the User Space speaks to it.
 *
 * - As the App (a JWT from `GH_APP_ID` and `GH_APP_PRIVATE_KEY`): look up
 *   an installation, and mint its tokens.
 * - As an installation (its token, kept here until five minutes before it
 *   expires): its repositories, a folder listing, branches, a branch's
 *   head commit, and a comparison of two commits.
 * - As a GitHub user, once (their OAuth code, exchanged with
 *   `GH_APP_CLIENT_ID` and `GH_APP_CLIENT_SECRET`): whether they manage
 *   an installation's account, the proof the installation is theirs. That
 *   is the account itself for a user's, an active owner for an
 *   organization's (which needs the App's Members: read permission; without
 *   it no one does). Their token is used for that one question and dropped.
 *
 * Tokens stay in this object: no answer carries one, except
 * `installationToken`, which a run hands to its own container.
 */

const Installation = Schema.Struct({
  id: Schema.Number,
  account: Schema.Struct({
    login: Schema.String,
    type: AccountType,
    avatar_url: Schema.String,
  }),
  created_at: Schema.String,
});

const Token = Schema.Struct({
  token: Schema.String,
  expires_at: Schema.String,
});

const UserToken = Schema.Union([
  Schema.Struct({ access_token: Schema.String }),
  Schema.Struct({ error: Schema.String }),
]);

const User = Schema.Struct({ login: Schema.String });

const Membership = Schema.Struct({ state: Schema.String, role: Schema.String });

const RepositoryPage = Schema.Struct({
  total_count: Schema.Number,
  repositories: Schema.Array(
    Schema.Struct({
      full_name: Schema.String,
      private: Schema.Boolean,
      default_branch: Schema.String,
    }),
  ),
});

const Contents = Schema.Union([
  Schema.Array(
    Schema.Struct({
      name: Schema.String,
      path: Schema.String,
      type: Schema.String,
    }),
  ),
  // A file's path answers with the file.
  Schema.Struct({ type: Schema.String }),
]);

const Branches = Schema.Array(
  Schema.Struct({
    name: Schema.String,
    commit: Schema.Struct({ sha: Schema.String }),
  }),
);

const Commit = Schema.Struct({
  sha: Schema.String,
  html_url: Schema.String,
  commit: Schema.Struct({
    message: Schema.String,
    author: Schema.NullOr(
      Schema.Struct({ name: Schema.String, date: Schema.String }),
    ),
  }),
});

const Comparison = Schema.Struct({
  status: Schema.String,
  ahead_by: Schema.Number,
  behind_by: Schema.Number,
  html_url: Schema.String,
  commits: Schema.Array(Commit),
});

/** An installation as GitHub describes it. */
export interface InstallationInfo {
  readonly installationId: number;
  readonly accountLogin: string;
  readonly accountType: AccountType;
  readonly avatarUrl: string;
  /** When it was installed, in milliseconds since the epoch. */
  readonly createdAt: number;
}

export interface RepositoryInfo {
  readonly fullName: string;
  readonly private: boolean;
  readonly defaultBranch: string;
}

export interface CommitInfo {
  readonly sha: string;
  /** Its first line. */
  readonly message: string;
  readonly author: string | null;
  /** In milliseconds since the epoch; null when GitHub didn't say. */
  readonly date: number | null;
  readonly url: string;
}

export interface Compared {
  /** `ahead`, `behind`, `identical` or `diverged`. */
  readonly status: string;
  readonly aheadBy: number;
  readonly behindBy: number;
  readonly url: string;
  readonly commits: ReadonlyArray<CommitInfo>;
}

/** The App's settings, from the Worker's env. */
export interface AppConfig {
  readonly appId: string;
  readonly slug: string;
  readonly privateKey: string;
  /** The App's OAuth client, for asking GitHub who a member is there. */
  readonly clientId: string;
  readonly clientSecret: string;
}

// GitHub's pages hold 100; a thousand repositories is plenty to pick from.
const PER_PAGE = 100;
const MAX_PAGES = 10;
// A token is good for an hour; one kept past 55 minutes is minted again.
const TOKEN_MARGIN = 5 * 60 * 1000;

const unreadable = new GitHubError({
  reason: 'refused',
  message: 'GitHub answered with something Console couldn’t read.',
});

const decode =
  <S extends Schema.Top>(schema: S) =>
  (body: unknown) =>
    Schema.decodeUnknownEffect(schema)(body).pipe(
      Effect.mapError(() => unreadable),
    ) as Effect.Effect<S['Type'], GitHubError>;

const commitOf = ({ sha, html_url, commit }: typeof Commit.Type) => ({
  sha,
  message: commit.message.split('\n')[0] ?? '',
  author: commit.author?.name ?? null,
  date: commit.author ? Date.parse(commit.author.date) : null,
  url: html_url,
});

type Installed = { readonly installationId: number };
type InRepo = Installed & { readonly repo: string };

export class GitHub extends Context.Service<
  GitHub,
  {
    /** Where the browser installs the App, returning with `state`. */
    readonly installUrl: (state: string) => string;
    /** Where the browser asks GitHub who its user is, returning to `redirectUri` with a code and `state`. */
    readonly authorizeUrl: (state: string, redirectUri: string) => string;
    /** Whether the GitHub user who was given `code` manages `account`'s installations. */
    readonly manages: (
      code: string,
      redirectUri: string,
      account: Pick<InstallationInfo, 'accountLogin' | 'accountType'>,
    ) => Effect.Effect<boolean, GitHubError>;
    /** The installation, as the App sees it; fails as not found when GitHub knows none. */
    readonly installation: (
      installationId: number,
    ) => Effect.Effect<InstallationInfo, GitHubError>;
    /** A token for the installation's repositories, good for at least five more minutes. */
    readonly installationToken: (
      installationId: number,
    ) => Effect.Effect<string, GitHubError>;
    /** Every repository the installation reaches, up to a thousand. */
    readonly repositories: (
      installationId: number,
    ) => Effect.Effect<ReadonlyArray<RepositoryInfo>, GitHubError>;
    /** One folder at `ref`; `path` is from the root, `''` for the root. */
    readonly listFolder: (
      input: InRepo & { readonly ref: string; readonly path: string },
    ) => Effect.Effect<ReadonlyArray<FolderEntry>, GitHubError>;
    readonly branches: (
      input: InRepo,
    ) => Effect.Effect<
      ReadonlyArray<{ readonly name: string; readonly sha: string }>,
      GitHubError
    >;
    readonly headCommit: (
      input: InRepo & { readonly branch: string },
    ) => Effect.Effect<CommitInfo, GitHubError>;
    readonly compare: (
      input: InRepo & { readonly base: string; readonly head: string },
    ) => Effect.Effect<Compared, GitHubError>;
  }
>()('alchemy-console/UserSpace/GitHub') {
  /** The App `config` names, asked through `fetch`. A key that won't
   * import fails each call, not the object. */
  static readonly layer = (config: AppConfig, fetch: Fetch) =>
    Layer.effect(
      GitHub,
      Effect.gen(function* () {
        const key = yield* Effect.cached(
          Effect.tryPromise({
            try: () => signingKey(config.privateKey),
            catch: () =>
              new Error('GH_APP_PRIVATE_KEY is not an RSA private key.'),
          }).pipe(Effect.orDie),
        );
        const asApp = (path: string, method?: 'GET' | 'POST') =>
          Effect.gen(function* () {
            const signing = yield* key;
            const jwt = yield* Effect.promise(() =>
              appJwt(signing, config.appId, Math.floor(Date.now() / 1000)),
            );
            return yield* call(fetch, jwt, path, method);
          });

        const tokens = new Map<
          number,
          { readonly token: string; readonly until: number }
        >();
        const installationToken = (installationId: number) =>
          Effect.gen(function* () {
            const kept = tokens.get(installationId);
            if (kept !== undefined && kept.until > Date.now())
              return kept.token;
            const minted = yield* asApp(
              `/app/installations/${installationId}/access_tokens`,
              'POST',
            ).pipe(Effect.flatMap(decode(Token)));
            tokens.set(installationId, {
              token: minted.token,
              until: Date.parse(minted.expires_at) - TOKEN_MARGIN,
            });
            return minted.token;
          });
        const asInstallation = (installationId: number, path: string) =>
          Effect.flatMap(installationToken(installationId), (token) =>
            call(fetch, token, path),
          );

        const userToken = (code: string, redirectUri: string) =>
          Effect.gen(function* () {
            const response = yield* Effect.tryPromise({
              try: () =>
                fetch('https://github.com/login/oauth/access_token', {
                  method: 'POST',
                  headers: {
                    accept: 'application/json',
                    'content-type': 'application/json',
                    'user-agent': 'alchemy-console',
                  },
                  body: JSON.stringify({
                    client_id: config.clientId,
                    client_secret: config.clientSecret,
                    code,
                    redirect_uri: redirectUri,
                  }),
                }),
              catch: () =>
                new GitHubError({
                  reason: 'unreachable',
                  message: 'Couldn’t reach GitHub. Try again in a moment.',
                }),
            });
            const answer = yield* Effect.promise(() =>
              response.json().catch(() => null),
            ).pipe(Effect.flatMap(decode(UserToken)));
            if ('error' in answer)
              return yield* new GitHubError({
                reason: 'refused',
                message: `GitHub didn’t confirm who you are (${answer.error}).`,
              });
            return answer.access_token;
          });

        return GitHub.of({
          installUrl: (state) =>
            `https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new?state=${encodeURIComponent(state)}`,
          authorizeUrl: (state, redirectUri) =>
            `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`,
          manages: (code, redirectUri, account) =>
            Effect.gen(function* () {
              const token = yield* userToken(code, redirectUri);
              const user = yield* call(fetch, token, '/user').pipe(
                Effect.flatMap(decode(User)),
              );
              if (account.accountType === 'User')
                return (
                  user.login.toLowerCase() ===
                  account.accountLogin.toLowerCase()
                );
              // An organization's: only one of its owners manages it.
              const membership = yield* call(
                fetch,
                token,
                `/user/memberships/orgs/${encodeURIComponent(account.accountLogin)}`,
              ).pipe(
                Effect.flatMap(decode(Membership)),
                Effect.catchIf(
                  (error) => error.reason !== 'unreachable',
                  () => Effect.succeed(null),
                ),
              );
              return (
                membership?.state === 'active' && membership.role === 'admin'
              );
            }),
          installation: (installationId) =>
            asApp(`/app/installations/${installationId}`).pipe(
              Effect.flatMap(decode(Installation)),
              Effect.map(({ id, account, created_at }) => ({
                installationId: id,
                accountLogin: account.login,
                accountType: account.type,
                avatarUrl: account.avatar_url,
                createdAt: Date.parse(created_at),
              })),
            ),
          installationToken,
          repositories: (installationId) =>
            Effect.gen(function* () {
              const found: Array<RepositoryInfo> = [];
              for (let page = 1; page <= MAX_PAGES; page++) {
                const { total_count, repositories } = yield* asInstallation(
                  installationId,
                  `/installation/repositories?per_page=${PER_PAGE}&page=${page}`,
                ).pipe(Effect.flatMap(decode(RepositoryPage)));
                found.push(
                  ...repositories.map((repository) => ({
                    fullName: repository.full_name,
                    private: repository.private,
                    defaultBranch: repository.default_branch,
                  })),
                );
                if (
                  repositories.length < PER_PAGE ||
                  found.length >= total_count
                )
                  break;
              }
              return found;
            }),
          listFolder: ({ installationId, repo, ref, path }) =>
            Effect.gen(function* () {
              const contents = yield* asInstallation(
                installationId,
                `/repos/${yield* repoPath(repo)}/contents/${yield* folderPath(path)}?ref=${encodeURIComponent(ref)}`,
              ).pipe(Effect.flatMap(decode(Contents)));
              if (!Array.isArray(contents))
                return yield* notFound(`“${path}” is a file, not a folder.`);
              return contents.flatMap((entry) =>
                entry.type === 'dir' || entry.type === 'file'
                  ? [{ name: entry.name, path: entry.path, type: entry.type }]
                  : [],
              );
            }),
          branches: ({ installationId, repo }) =>
            Effect.gen(function* () {
              const branches = yield* asInstallation(
                installationId,
                `/repos/${yield* repoPath(repo)}/branches?per_page=${PER_PAGE}`,
              ).pipe(Effect.flatMap(decode(Branches)));
              return branches.map(({ name, commit }) => ({
                name,
                sha: commit.sha,
              }));
            }),
          headCommit: ({ installationId, repo, branch }) =>
            Effect.gen(function* () {
              const commit = yield* asInstallation(
                installationId,
                `/repos/${yield* repoPath(repo)}/commits/${encodeURIComponent(branch)}`,
              ).pipe(Effect.flatMap(decode(Commit)));
              return commitOf(commit);
            }),
          compare: ({ installationId, repo, base, head }) =>
            Effect.gen(function* () {
              const compared = yield* asInstallation(
                installationId,
                `/repos/${yield* repoPath(repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
              ).pipe(Effect.flatMap(decode(Comparison)));
              return {
                status: compared.status,
                aheadBy: compared.ahead_by,
                behindBy: compared.behind_by,
                url: compared.html_url,
                commits: compared.commits.map(commitOf),
              };
            }),
        });
      }),
    );
}
