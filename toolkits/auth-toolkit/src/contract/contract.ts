/** Where the Auth Worker's Better Auth API lives, below its own URL. */
export const AUTH_API_PATH = '/api/auth';

/** Where the Auth Worker serves its own pages. */
export const AUTH_PAGES = {
  login: '/login',
  consent: '/consent',
  device: '/device',
  error: '/error',
} as const;

/** The User as every program sees it, whatever credential proved them. */
export interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

/** An Auth Worker API endpoint, e.g. `authWorkerApiUrl(url, '/get-session')`. */
export const authWorkerApiUrl = (authWorkerUrl: string, path = ''): string =>
  `${authWorkerUrl.replace(/\/$/, '')}${AUTH_API_PATH}${path}`;

/** The `iss` of every Access Token the Auth Worker signs. */
export const authWorkerIssuer = (authWorkerUrl: string): string =>
  authWorkerApiUrl(authWorkerUrl);

/** Where a Resource Server fetches the keys that sign Access Tokens. */
export const authWorkerJwksUrl = (authWorkerUrl: string): string =>
  authWorkerApiUrl(authWorkerUrl, '/jwks');
