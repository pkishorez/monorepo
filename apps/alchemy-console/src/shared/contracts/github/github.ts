import { Schema } from 'effect';

/*
 * GitHub as the browser sees it: the GitHub connections a member made, the
 * repositories they reach, and a repository's folders. Tokens never leave
 * the server; nothing here holds one.
 */

export const AccountType = Schema.Literals(['User', 'Organization']);
export type AccountType = typeof AccountType.Type;

/** One GitHub account or organization a member connected: one App installation. */
export const GitHubConnection = Schema.Struct({
  connectionId: Schema.String,
  installationId: Schema.Number,
  accountLogin: Schema.String,
  accountType: AccountType,
  avatarUrl: Schema.String,
  /** How many repositories the installation lets Console see. */
  repositoryCount: Schema.Number,
});
export type GitHubConnection = typeof GitHubConnection.Type;

/** A repository a connection reaches. */
export const Repository = Schema.Struct({
  connectionId: Schema.String,
  /** `owner/name`. */
  fullName: Schema.String,
  private: Schema.Boolean,
  defaultBranch: Schema.String,
});
export type Repository = typeof Repository.Type;

/** One entry of a repository folder. */
export const FolderEntry = Schema.Struct({
  name: Schema.String,
  /** From the repository's root, without a leading slash. */
  path: Schema.String,
  type: Schema.Literals(['dir', 'file']),
});
export type FolderEntry = typeof FolderEntry.Type;

/** Why a GitHub call was refused. */
export class GitHubError extends Schema.Error<GitHubError>(
  'alchemy-console/GitHubError',
)({
  _tag: Schema.tag('GitHubError'),
  reason: Schema.Literals([
    /** No such connection, repository, folder or installation. */
    'not-found',
    /** GitHub said no, or answered with something Console can't read. */
    'refused',
    /** GitHub could not be reached. */
    'unreachable',
  ]),
  message: Schema.String,
}) {}

/** Where a GitHub install began, so the member comes back to it. */
export const ReturnTo = Schema.Literals(['/', '/settings']);
export type ReturnTo = typeof ReturnTo.Type;

/**
 * How a return from GitHub went, as `?github=` on the page it lands on.
 * `connected` needs no words: the connection shows up.
 */
export const GitHubReturn = Schema.Literals([
  'connected',
  /** The install began somewhere else, or too long ago. */
  'expired',
  /** Another Console user already connected that account. */
  'taken',
  /** GitHub knows no such installation of the App. */
  'not-found',
  'unreachable',
  /** An organization owner has to approve the install first. */
  'requested',
]);
export type GitHubReturn = typeof GitHubReturn.Type;

/** Where an installation is managed on GitHub: repository access, suspension, uninstall. */
export const manageUrlOf = (
  connection: Pick<
    GitHubConnection,
    'accountLogin' | 'accountType' | 'installationId'
  >,
) =>
  connection.accountType === 'Organization'
    ? `https://github.com/organizations/${encodeURIComponent(connection.accountLogin)}/settings/installations/${connection.installationId}`
    : `https://github.com/settings/installations/${connection.installationId}`;
