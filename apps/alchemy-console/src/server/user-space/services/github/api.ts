import { Effect } from 'effect';
import { GitHubError } from '../../../../shared/contracts/github/index.ts';

/*
 * One call to GitHub's REST API, as the App or as one of its installations,
 * answered with the JSON body or a GitHubError. GitHub's own message is
 * kept, since it names the failure best; a token is never in it.
 */

export type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const API = 'https://api.github.com';

/** Owner and name, each as GitHub allows them, so a repository can't reach another path. */
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const notFound = (message: string) =>
  new GitHubError({ reason: 'not-found', message });

const unreachable = new GitHubError({
  reason: 'unreachable',
  message: 'Couldn’t reach GitHub. Try again in a moment.',
});

/** `owner/name`, checked, for a path; fails as not found when it can't be one. */
export const repoPath = (repo: string) =>
  REPO.test(repo) && !repo.split('/').some((part) => /^\.+$/.test(part))
    ? Effect.succeed(repo)
    : Effect.fail(notFound(`“${repo}” isn’t a repository name.`));

/** A folder path from the root, each segment encoded; fails for `..` or `.`. */
export const folderPath = (path: string) => {
  const segments = path.split('/').filter((segment) => segment !== '');
  return segments.some((segment) => segment === '.' || segment === '..')
    ? Effect.fail(notFound(`“${path}” isn’t a folder.`))
    : Effect.succeed(segments.map(encodeURIComponent).join('/'));
};

/** GET (or `method`) `path` with `token` (`Bearer` for both an App JWT and an installation token). */
export const call = (
  fetch: Fetch,
  token: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${API}${path}`, {
          method,
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'user-agent': 'alchemy-console',
            'x-github-api-version': '2022-11-28',
          },
        }),
      catch: () => unreachable,
    });
    const body = (yield* Effect.promise(() =>
      response.json().catch(() => null),
    )) as { readonly message?: unknown } | null;
    if (response.ok) return body as unknown;
    const said =
      typeof body?.message === 'string'
        ? ` GitHub said: ${body.message.slice(0, 200)}.`
        : '';
    if (response.status === 404)
      return yield* notFound(`GitHub found nothing there.${said}`);
    if (response.status >= 500) return yield* unreachable;
    return yield* new GitHubError({
      reason: 'refused',
      message: `GitHub refused (${response.status}).${said}`,
    });
  });
