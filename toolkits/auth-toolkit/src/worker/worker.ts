import { betterAuth, type Auth, type BetterAuthOptions } from 'better-auth';
import { dash } from '@better-auth/infra';
import {
  authModelOptions,
  authorizationServerOptions,
  type AuthorizationServerConfig,
} from './auth-model.js';
import { servePages, type Branding, type PagesApp } from './pages.js';

type ValidateUser = NonNullable<
  NonNullable<BetterAuthOptions['user']>['validateUserInfo']
>;

interface AuthWorkerConfig {
  /** The Auth Worker's own deployed URL. */
  baseURL: string;
  secret: string;
  /** The name, and optionally the logo, the pages show. */
  branding: Branding;
  /** Build with a Primary Database provider from `database/*`, e.g.
   * `d1PrimaryDatabase(env.DB)` or `memoryPrimaryDatabase()` for tests. */
  database: BetterAuthOptions['database'];
  google: { clientId: string; clientSecret: string };
  /** Origins allowed a Direct Session Check — supports `*.example.com`. */
  trustedOrigins: string[];
  /** The Shared Cookie Domain, e.g. `.example.com`, so every subdomain's
   * Direct Session Check can read the session cookie. Omit to keep the
   * cookie scoped to the Auth Worker's own origin only. */
  cookieDomain?: string | undefined;
  /** Cookie Cache TTL, in seconds. @default 300 (5 minutes) */
  cookieCacheMaxAge?: number | undefined;
  /** Enables Better Auth Infrastructure's Dash plugin when non-empty. */
  dashApiKey?: string | undefined;
  /** Accepts or rejects identities during registration, account linking, and
   * fresh provider sign-in. */
  validateUser?: ValidateUser | undefined;
  /** Enables the Authorization Server Role: Client Applications obtain Access
   * Tokens for the listed Resource Servers through consent or the device
   * flow. Omit to run the Identity Role only. */
  authorizationServer?: AuthorizationServerConfig | undefined;
  /** The pages app. The built `auth-toolkit/worker` door supplies it; only
   * source imports (tests) leave it out. */
  pages?: PagesApp | undefined;
}

const API_PATH = '/api/auth';

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
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return false;
    }
    // A scheme-less pattern never grants a plaintext origin credentialed CORS.
    if (url.protocol !== 'https:') return false;
    value = url.host;
  }
  const source = escapeRegExp(pattern)
    .replaceAll('\\*', '.*')
    .replaceAll('\\?', '.');
  return new RegExp(`^${source}$`, 'i').test(value);
};

export const validateTrustedOrigins = (patterns: ReadonlyArray<string>) =>
  patterns.forEach(validateTrustedOrigin);

export const isTrustedOrigin = (
  origin: string,
  patterns: ReadonlyArray<string>,
) => patterns.some((pattern) => matchesTrustedOrigin(origin, pattern));

const corsHeaders = (request: Request, trustedOrigins: string[]) => {
  // Vary: Origin even when untrusted, so a shared cache never serves one
  // origin's CORS response to another.
  const headers = new Headers({ Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (!origin || !isTrustedOrigin(origin, trustedOrigins)) {
    return { allowed: false, headers };
  }

  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', CORS_METHODS);
  headers.set('Access-Control-Allow-Origin', origin);
  const requestedHeaders = request.headers.get(
    'Access-Control-Request-Headers',
  );
  if (requestedHeaders) {
    headers.set('Access-Control-Allow-Headers', requestedHeaders);
    headers.append('Vary', 'Access-Control-Request-Headers');
  }
  return { allowed: true, headers };
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

export const createAuthWorker = (
  config: AuthWorkerConfig,
): {
  auth: Auth<BetterAuthOptions>;
  handler: (request: Request) => Promise<Response>;
} => {
  validateTrustedOrigins(config.trustedOrigins);

  const modelOptions = authModelOptions(config);
  const authorizationServer = config.authorizationServer
    ? authorizationServerOptions(config.authorizationServer)
    : undefined;
  const dashApiKey = config.dashApiKey?.trim();

  const auth = betterAuth({
    ...modelOptions,
    baseURL: config.baseURL,
    secret: config.secret,
    database: config.database,
    trustedOrigins: config.trustedOrigins,
    user: config.validateUser
      ? { validateUserInfo: config.validateUser }
      : undefined,
    plugins: [
      ...(modelOptions.plugins ?? []),
      ...(authorizationServer?.plugins ?? []),
      ...(dashApiKey ? [dash({ apiKey: dashApiKey })] : []),
    ],
    disabledPaths: authorizationServer?.disabledPaths,
    advanced: config.cookieDomain
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: config.cookieDomain,
          },
        }
      : undefined,
  }) as Auth<BetterAuthOptions>;

  const { authorizationServer: role, branding, pages } = config;

  const handler = async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (pathname !== API_PATH && !pathname.startsWith(`${API_PATH}/`)) {
      return role && pages
        ? servePages(pages, request, branding)
        : new Response('Not found', { status: 404 });
    }

    const { allowed, headers: cors } = corsHeaders(
      request,
      config.trustedOrigins,
    );
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    }

    const response = await auth.handler(request);
    return withCorsHeaders(response, cors);
  };

  return { auth, handler };
};
