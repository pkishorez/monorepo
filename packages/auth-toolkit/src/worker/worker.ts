import {
  betterAuth,
  type BetterAuthOptions,
  type SecondaryStorage,
} from 'better-auth';
import { dash } from '@better-auth/infra';
import { authModelOptions } from './auth-model.js';

type ValidateUser = NonNullable<
  NonNullable<BetterAuthOptions['user']>['validateUserInfo']
>;

interface AuthWorkerConfig {
  /** The Auth Worker's own deployed URL. */
  baseURL: string;
  secret: string;
  /** Build with a Primary Database provider from `database/*`, e.g.
   * `d1PrimaryDatabase(env.DB)` or `memoryPrimaryDatabase()` for tests. */
  database: BetterAuthOptions['database'];
  /** Build with a Session Store provider from `secondary/*`, e.g.
   * `kvSessionStore(env.KV)` or `memorySessionStore()` for tests. */
  secondaryStorage: SecondaryStorage;
  google: { clientId: string; clientSecret: string };
  /** Origins allowed a Direct Session Check — supports `*.example.com`. */
  trustedOrigins: string[];
  /** The Shared Cookie Domain, e.g. `.example.com`, so every subdomain's
   * Direct Session Check can read the session cookie. Omit to keep the
   * cookie scoped to the Auth Worker's own origin only. */
  cookieDomain?: string;
  /** Cookie Cache TTL, in seconds. @default 300 (5 minutes) */
  cookieCacheMaxAge?: number;
  /** Enables Better Auth Infrastructure's Dash plugin when non-empty. */
  dashApiKey?: string;
  /** Accepts or rejects identities during registration, account linking, and
   * fresh provider sign-in. */
  validateUser?: ValidateUser;
}

const CORS_METHODS = 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS';

const escapeRegExp = (value: string) =>
  value.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');

/** Rejects a trustedOrigins entry that can never match anything, e.g. a
 * scheme-less exact pattern or a wildcard pattern with a stray path/query.
 * Thrown from `createAuthWorker` itself, so a bad config fails at startup
 * instead of silently never granting CORS access. */
const validateTrustedOrigin = (pattern: string) => {
  const hasWildcard = pattern.includes('*') || pattern.includes('?');
  const usage =
    'expected a full origin (e.g. "https://app.example.com") or a host pattern (e.g. "*.example.com")';

  if (!hasWildcard) {
    try {
      new URL(pattern);
      return;
    } catch {
      throw new Error(`Invalid trustedOrigins pattern "${pattern}": ${usage}.`);
    }
  }

  const probe = pattern.replaceAll('*', 'x').replaceAll('?', 'x');
  const hasScheme = probe.includes('://');
  try {
    const url = hasScheme ? new URL(probe) : new URL(`https://${probe}`);
    const isBareOrigin = url.pathname === '/' && !url.search && !url.hash;
    const hostMatches = hasScheme || url.host === probe;
    if (isBareOrigin && hostMatches) return;
  } catch {
    // fall through to the shared error below
  }
  throw new Error(`Invalid trustedOrigins pattern "${pattern}": ${usage}.`);
};

const matchesTrustedOrigin = (origin: string, pattern: string) => {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return new URL(pattern).origin === origin;
  }

  let value = origin;
  if (!pattern.includes('://')) {
    try {
      value = new URL(origin).host;
    } catch {
      return false;
    }
  }
  const source = escapeRegExp(pattern)
    .replaceAll('\\*', '.*')
    .replaceAll('\\?', '.');
  return new RegExp(`^${source}$`, 'i').test(value);
};

const corsHeaders = (request: Request, trustedOrigins: string[]) => {
  const origin = request.headers.get('Origin');
  if (
    !origin ||
    !trustedOrigins.some((pattern) => matchesTrustedOrigin(origin, pattern))
  ) {
    return undefined;
  }

  const headers = new Headers({
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': CORS_METHODS,
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  });
  const requestedHeaders = request.headers.get(
    'Access-Control-Request-Headers',
  );
  if (requestedHeaders) {
    headers.set('Access-Control-Allow-Headers', requestedHeaders);
    headers.append('Vary', 'Access-Control-Request-Headers');
  }
  return headers;
};

const withCorsHeaders = (response: Response, cors: Headers) => {
  const headers = new Headers(response.headers);
  cors.forEach((value, key) => {
    if (key === 'vary' && headers.has(key)) {
      headers.append(key, value);
    } else {
      headers.set(key, value);
    }
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const createAuthWorker = (config: AuthWorkerConfig) => {
  config.trustedOrigins.forEach(validateTrustedOrigin);

  const modelOptions = authModelOptions(config);
  const dashApiKey = config.dashApiKey?.trim();

  const auth = betterAuth({
    ...modelOptions,
    baseURL: config.baseURL,
    secret: config.secret,
    database: config.database,
    secondaryStorage: config.secondaryStorage,
    trustedOrigins: config.trustedOrigins,
    user: config.validateUser
      ? { validateUserInfo: config.validateUser }
      : undefined,
    plugins: [
      ...(modelOptions.plugins ?? []),
      ...(dashApiKey ? [dash({ apiKey: dashApiKey })] : []),
    ],
    advanced: config.cookieDomain
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: config.cookieDomain,
          },
        }
      : undefined,
  });

  const handler = async (request: Request) => {
    const cors = corsHeaders(request, config.trustedOrigins);
    if (request.method === 'OPTIONS') {
      return cors
        ? new Response(null, { status: 204, headers: cors })
        : new Response(null, { status: 403 });
    }

    const response = await auth.handler(request);
    return cors ? withCorsHeaders(response, cors) : response;
  };

  return { auth, handler };
};
