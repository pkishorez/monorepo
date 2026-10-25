import { betterAuth, type Auth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { dash } from '@better-auth/infra';
import { authorizationServerOptions } from './authorization-server/authorization-server.js';
import { identityOptions } from './identity/identity.js';
import { browserApi, type AuthApi } from './browser/browser-api.js';
import { refuseCaller } from './browser/callers.js';
import { normalizeClientRegistration } from './authorization-server/client-registration.js';
import {
  resolveConfig,
  trustedOriginPatterns,
  type AuthWorkerConfig,
  type Resolved,
} from './config.js';
import {
  AUTH_API_PATH,
  TEST_SIGN_IN_PATH,
  isTestEmail,
} from '../../contract/index.js';
import { withoutSessionTokens } from './browser/no-tokens.js';
import { TEST_SIGN_IN_METHOD, testSignIn } from './identity/test-sign-in.js';
import { servePages, type PagesApp, type PagesContext } from './pages.js';
import { d1 } from '../database/sqlite/d1/database/index.js';

export { d1 };

export interface AuthWorker {
  /** The better-auth instance, for server-side calls. */
  auth: Auth<BetterAuthOptions>;
  /** Serves `/api/auth/*`, the pages, and their assets. */
  handler: (request: Request) => Promise<Response>;
}

type ValidateUserInfo = NonNullable<
  NonNullable<BetterAuthOptions['user']>['validateUserInfo']
>;

const NOT_ADMITTED = {
  error: 'not_admitted',
  errorDescription: 'This account cannot sign in here.',
};

// `admit` judges real users only: Test Sign-In's Test Users skip it, and a
// `.test` email from anywhere else, as Google, is refused.
const admission = (
  admit: NonNullable<AuthWorkerConfig['admit']>,
): ValidateUserInfo => {
  return async ({ user, source }) => {
    const email = typeof user.email === 'string' ? user.email : '';
    const name = typeof user.name === 'string' ? user.name : '';
    if (isTestEmail(email)) {
      return source.method === TEST_SIGN_IN_METHOD ? undefined : NOT_ADMITTED;
    }
    return (await admit({ email, name })) === true ? undefined : NOT_ADMITTED;
  };
};

const notAdmitted = () =>
  new APIError('FORBIDDEN', {
    code: NOT_ADMITTED.error,
    message: NOT_ADMITTED.errorDescription,
  });

/** A Test User is created by Test Sign-In alone, with `admit` or without,
 * and no User's email ever crosses into or out of `.test`, as an
 * Administrator's update could make it. */
const testUsersStayTestUsers: BetterAuthOptions['databaseHooks'] = {
  user: {
    create: {
      before: async (user, context) => {
        if (isTestEmail(user.email) && context?.path !== TEST_SIGN_IN_PATH) {
          throw notAdmitted();
        }
      },
    },
    update: {
      before: async (user, context) => {
        if (typeof user.email !== 'string') return;
        if (isTestEmail(user.email)) throw notAdmitted();
        // Who is updated is not handed to the hook: an Administrator names
        // them in the body, anyone else updates themselves.
        const body = context?.body as { userId?: unknown } | undefined;
        const userId =
          typeof body?.userId === 'string'
            ? body.userId
            : context?.context.session?.user.id;
        const current = userId
          ? await context?.context.internalAdapter.findUserById(userId)
          : null;
        if (current && isTestEmail(current.email)) throw notAdmitted();
      },
    },
  },
};

const REGISTRATION_PATH = '/oauth2/register';
const WELL_KNOWN_PATH = '/.well-known/';
const CORS_METHODS = 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS';

const corsHeaders = (request: Request, resolved: Resolved) => {
  const headers = new Headers({ Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (!resolved.isTrustedOrigin(origin)) return { allowed: false, headers };

  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', CORS_METHODS);
  headers.set('Access-Control-Allow-Origin', origin!);
  const requested = request.headers.get('Access-Control-Request-Headers');
  if (requested) {
    headers.set('Access-Control-Allow-Headers', requested);
    headers.append('Vary', 'Access-Control-Request-Headers');
  }
  return { allowed: true, headers };
};

const withCorsHeaders = (response: Response, cors: Headers) => {
  const headers = new Headers(response.headers);
  cors.forEach((value, key) => {
    if (key === 'vary' && headers.has(key)) headers.append(key, value);
    else headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/** The Auth Worker with a pages app; the built `worker` door supplies it. */
export const makeAuthWorker = (
  config: AuthWorkerConfig,
  pages?: PagesApp,
): AuthWorker => {
  const resolved = resolveConfig(config);
  const model = identityOptions({
    google: config.google,
    maxAccounts: resolved.maxAccounts,
  });
  const authorizationServer = resolved.scopes
    ? authorizationServerOptions({
        resources: resolved.resources,
        scopes: Object.keys(resolved.scopes),
      })
    : undefined;
  const dashApiKey = config.dashApiKey?.trim();

  const auth = betterAuth({
    ...model,
    baseURL: config.url,
    secret: config.secret,
    database: config.database,
    trustedOrigins: trustedOriginPatterns(resolved),
    user: config.admit
      ? { validateUserInfo: admission(config.admit) }
      : undefined,
    databaseHooks: testUsersStayTestUsers,
    plugins: [
      ...(model.plugins ?? []),
      ...(authorizationServer?.plugins ?? []),
      ...(config.testUsers
        ? [
            testSignIn({
              ...config.testUsers,
              maxAccounts: resolved.maxAccounts,
            }),
          ]
        : []),
      ...(dashApiKey ? [dash({ apiKey: dashApiKey })] : []),
    ],
    disabledPaths: authorizationServer?.disabledPaths,
    advanced: {
      crossSubDomainCookies: { enabled: true, domain: resolved.domain },
    },
  }) as Auth<BetterAuthOptions>;

  const browser = browserApi(auth as unknown as AuthApi, resolved);
  const pagesContext: PagesContext = {
    brand: config.brand,
    maxAccounts: resolved.maxAccounts,
    cookieDomain: resolved.domain,
    origin: resolved.origin,
    oauth: resolved.scopes ? { scopes: resolved.scopes } : undefined,
    testUsers: config.testUsers
      ? { key: config.testUsers.key !== undefined }
      : undefined,
    reads: browser.reads,
  };

  const handler = async (request: Request) => {
    const { pathname } = new URL(request.url);
    const isApiPath =
      pathname === AUTH_API_PATH || pathname.startsWith(`${AUTH_API_PATH}/`);
    const isAuthPath =
      isApiPath ||
      (authorizationServer !== undefined &&
        pathname.startsWith(WELL_KNOWN_PATH));
    if (!isAuthPath) {
      return pages
        ? servePages(pages, request, pagesContext)
        : new Response('Not found', { status: 404 });
    }

    const { allowed, headers: cors } = corsHeaders(request, resolved);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    }

    const apiPath = isApiPath ? pathname.slice(AUTH_API_PATH.length) : pathname;
    const refusal = isApiPath
      ? refuseCaller(request, apiPath, resolved.origin)
      : undefined;
    if (refusal) return withCorsHeaders(refusal, cors);
    const own = isApiPath ? await browser.handle(request, apiPath) : undefined;
    const response =
      own ??
      (await withoutSessionTokens(
        await auth.handler(
          apiPath === REGISTRATION_PATH
            ? await normalizeClientRegistration(request)
            : request,
        ),
        apiPath,
      ));
    return withCorsHeaders(response, cors);
  };

  return { auth, handler };
};

/** The Auth Worker. From source it serves no pages; the built
 * `@kestack/auth-toolkit/worker` door pairs it with them. */
export const authWorker = (config: AuthWorkerConfig): AuthWorker =>
  makeAuthWorker(config);
