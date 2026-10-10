import { betterAuth, type Auth, type BetterAuthOptions } from 'better-auth';
import { dash } from '@better-auth/infra';
import {
  authModelOptions,
  authorizationServerOptions,
  multiSessionAccounts,
  type AuthorizationServerConfig,
  type MultiSessionConfig,
} from './auth-model.js';
import { normalizeClientRegistration } from './client-registration.js';
import {
  AUTH_API_PATH,
  type Branding,
  type PagesContext,
} from '../../contract/index.js';
import { servePages, type PagesApp } from './pages.js';
import { TEST_SIGN_IN_STAGE, testSignIn } from './plugins/index.js';
import { isTrustedOrigin, validateTrustedOrigins } from './trusted-origins.js';
import { d1 } from '../database/sqlite/d1/database/index.js';

export { d1, isTrustedOrigin, validateTrustedOrigins };

type ValidateUser = NonNullable<
  NonNullable<BetterAuthOptions['user']>['validateUserInfo']
>;

interface AuthWorkerConfig {
  baseURL: string;
  secret: string;
  branding: Branding;
  database: BetterAuthOptions['database'];
  google: { clientId: string; clientSecret: string };
  trustedOrigins: string[];
  cookieDomain?: string | undefined;
  cookieCacheMaxAge?: number | undefined;
  multiSession?: MultiSessionConfig | undefined;
  dashApiKey?: string | undefined;
  validateUser?: ValidateUser | undefined;
  authorizationServer?: AuthorizationServerConfig | undefined;
  pages?: PagesApp | undefined;
  /** Turns the Test Sign-In on: anyone with a `.test` email signs in by
   * naming it. Only the `local` stage may; any other `stage` makes
   * `createAuthWorker` throw, so the service refuses to start. */
  testSignIn?: { stage: string } | undefined;
}

const REGISTRATION_PATH = `${AUTH_API_PATH}/oauth2/register`;
const WELL_KNOWN_PATH = '/.well-known/';

const CORS_METHODS = 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS';

const corsHeaders = (request: Request, trustedOrigins: string[]) => {
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
  if (config.testSignIn && config.testSignIn.stage !== TEST_SIGN_IN_STAGE) {
    throw new Error(
      `The Test Sign-In runs only on the "${TEST_SIGN_IN_STAGE}" stage, not "${config.testSignIn.stage}".`,
    );
  }

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
      ...(config.testSignIn ? [testSignIn()] : []),
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
  const maximumAccounts = multiSessionAccounts(config.multiSession);
  const pagesContext: PagesContext = {
    branding,
    multiSession: { maximumAccounts },
    testSignIn: config.testSignIn !== undefined,
    authorizationServer: role
      ? {
          scopes: Object.fromEntries(
            (role.scopes ?? []).map((scope) => [scope.name, scope.description]),
          ),
        }
      : undefined,
  };

  const handler = async (request: Request) => {
    const { pathname } = new URL(request.url);
    const isAuthPath =
      pathname === AUTH_API_PATH ||
      pathname.startsWith(`${AUTH_API_PATH}/`) ||
      (role !== undefined && pathname.startsWith(WELL_KNOWN_PATH));
    if (!isAuthPath) {
      return pages
        ? servePages(pages, request, pagesContext)
        : new Response('Not found', { status: 404 });
    }

    const { allowed, headers: cors } = corsHeaders(
      request,
      config.trustedOrigins,
    );
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    }

    const response = await auth.handler(
      pathname === REGISTRATION_PATH
        ? await normalizeClientRegistration(request)
        : request,
    );
    return withCorsHeaders(response, cors);
  };

  return { auth, handler };
};
