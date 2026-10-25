// The Auth Worker's own endpoints for Browser callers: its pages and a
// First-Party web app's `Accounts`. Everything is keyed by userId or Sign-in
// id; no response carries a token (ADR 0019). The Approving Account
// endpoints act as an Account other than the Active Account by picking its
// session out of this browser's multi-session cookies on the server.
import { isAPIError } from 'better-auth/api';
import { makeSignature } from 'better-auth/crypto';
import { AUTH_API_PATH } from '../../../contract/index.js';
import type { Resolved } from '../config.js';
import { signInName, type SignInKind } from './sign-in-name.js';

/** An Account as a page sees it: a User, never a token. */
export interface AccountView {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export interface SignInView {
  id: string;
  /** "Chrome on macOS", "acme-cli on laptop". */
  name: string;
  kind: SignInKind;
  /** This browser's Sign-in of the Active Account. */
  current: boolean;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

export interface ScopeView {
  name: string;
  description: string;
}

export interface ClientView {
  id: string;
  name: string;
  icon: string | null;
  uri: string | null;
}

export interface GrantView {
  id: string;
  client: ClientView;
  scopes: ScopeView[];
  grantedAt: string;
}

export interface AccountListView {
  /** The Active Account, if it is one of `accounts`. */
  active: string | null;
  accounts: AccountView[];
}

export interface DeviceRequestView {
  userCode: string;
  status: string;
  /** The Device's OAuth Client id, as it named itself. */
  app: string | null;
}

export interface ConsentRequestView {
  client: ClientView;
  scopes: ScopeView[];
}

/**
 * What the pages read of this browser, in-process, keyed by its request's
 * cookies; each read fails as its endpoint does, with a `code` and a
 * `message`. Nothing it answers carries a token (ADR 0019).
 */
export interface BrowserReads {
  accounts: (request: Request) => Promise<AccountListView>;
  /** The Active Account's Sign-ins; fails `signed_out` without one. */
  signIns: (request: Request) => Promise<SignInView[]>;
  /** The Active Account's Grants; fails `signed_out` without one. */
  grants: (request: Request) => Promise<GrantView[]>;
  /** A Device Login code, looked up without claiming it. */
  deviceRequest: (userCode: string) => Promise<DeviceRequestView>;
  /** The consent request in a page's signed query (`?…`). */
  consentRequest: (search: string) => Promise<ConsentRequestView>;
}

interface SessionRecord {
  id: string;
  token: string;
  userId: string;
  userAgent?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string;
}

interface UserRecord {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

interface SessionWithUser {
  session: SessionRecord;
  user: UserRecord;
}

interface DeviceCodeRecord {
  id: string;
  userCode: string;
  userId?: string | null;
  clientId?: string | null;
  status: string;
  expiresAt: Date;
}

interface ClientRecord {
  clientId: string;
  name?: string | null;
  icon?: string | null;
  uri?: string | null;
}

interface ConsentRecord {
  id: string;
  clientId: string;
  userId: string;
  scopes: string[] | string;
  createdAt: Date | string;
}

type Where = Array<{ field: string; value: unknown; operator?: 'eq' }>;

interface Adapter {
  findOne: <T>(input: { model: string; where: Where }) => Promise<T | null>;
  findMany: <T>(input: { model: string; where: Where }) => Promise<T[]>;
  update: (input: {
    model: string;
    where: Where;
    update: Record<string, unknown>;
  }) => Promise<unknown>;
  updateMany: (input: {
    model: string;
    where: Where;
    update: Record<string, unknown>;
  }) => Promise<unknown>;
  delete: (input: { model: string; where: Where }) => Promise<unknown>;
}

interface WithHeaders<T> {
  headers: Headers;
  response: T;
}

/** The slice of better-auth this module calls; typed by hand because the
 * options are assembled at runtime. */
export interface AuthApi {
  api: {
    getSession: (input: {
      headers: Headers;
      query?: { disableCookieCache?: boolean };
    }) => Promise<SessionWithUser | null>;
    listDeviceSessions: (input: {
      headers: Headers;
    }) => Promise<SessionWithUser[]>;
    setActiveSession: (input: {
      headers: Headers;
      body: { sessionToken: string };
      returnHeaders: true;
    }) => Promise<WithHeaders<unknown>>;
    revokeDeviceSession: (input: {
      headers: Headers;
      body: { sessionToken: string };
      returnHeaders: true;
    }) => Promise<WithHeaders<unknown>>;
    deviceVerify: (input: {
      headers: Headers;
      query: { user_code: string };
    }) => Promise<unknown>;
    deviceApprove: (input: {
      headers: Headers;
      body: { userCode: string };
    }) => Promise<unknown>;
    deviceDeny: (input: {
      headers: Headers;
      body: { userCode: string };
    }) => Promise<unknown>;
    oauth2Consent?: unknown;
  };
  handler: (request: Request) => Promise<Response>;
  $context: Promise<{
    adapter: Adapter;
    internalAdapter: {
      listSessions: (userId: string) => Promise<SessionRecord[]>;
      deleteSession: (token: string) => Promise<unknown>;
    };
  }>;
}

class Failure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const json = (body: unknown, status = 200, cookies: string[] = []) => {
  const headers = new Headers({
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
};

const iso = (value: Date | string) => new Date(value).toISOString();

const bearer = (token: string) =>
  new Headers({ authorization: `Bearer ${token}` });

const accountView = (user: UserRecord): AccountView => ({
  id: user.id,
  email: user.email,
  name: user.name,
  image: user.image ?? null,
});

const scopeList = (value: string[] | string | null | undefined) =>
  Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
          try {
            const parsed: unknown = JSON.parse(value);
            return Array.isArray(parsed) ? (parsed as string[]) : [value];
          } catch {
            return value.split(' ').filter(Boolean);
          }
        })()
      : [];

const readBody = async (request: Request) => {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new Failure(415, 'invalid_request', 'Send a JSON body.');
  }
  try {
    const body: unknown = await request.json();
    if (body !== null && typeof body === 'object') {
      return body as Record<string, unknown>;
    }
  } catch {
    // Falls through to the same failure.
  }
  throw new Failure(400, 'invalid_request', 'Send a JSON object.');
};

const text = (body: Record<string, unknown>, key: string) => {
  const value = body[key];
  if (typeof value !== 'string' || !value) {
    throw new Failure(400, 'invalid_request', `"${key}" is required.`);
  }
  return value;
};

const flag = (body: Record<string, unknown>, key: string) => {
  const value = body[key];
  if (typeof value !== 'boolean') {
    throw new Failure(
      400,
      'invalid_request',
      `"${key}" must be true or false.`,
    );
  }
  return value;
};

// better-auth's own lookup: exact first, then the default alphabet
// without separators, upper-cased.
const userCodeCandidates = (userCode: string) => {
  const normalized = userCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalized === userCode ? [userCode] : [userCode, normalized];
};

/** The consent page's signed query, as the oauth-provider client builds it:
 * only the signed parameters. */
const signedOAuthQuery = (search: string) => {
  const params = new URLSearchParams(search.replace(/^\?/, ''));
  const names = new Set(params.getAll('ba_param'));
  const signed = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === 'sig' || key === 'ba_param' || names.has(key)) {
      signed.append(key, value);
    }
  }
  return signed;
};

const verifySignedQuery = async (signed: URLSearchParams, secret: string) => {
  const sigs = signed.getAll('sig');
  const exp = Number(signed.get('exp'));
  const rest = new URLSearchParams(signed);
  rest.delete('sig');
  const canonical = new URLSearchParams(
    [...rest.entries()].sort(([a, x], [b, y]) =>
      a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0,
    ),
  );
  return (
    sigs.length === 1 &&
    sigs[0] === (await makeSignature(canonical.toString(), secret)) &&
    Number.isFinite(exp) &&
    exp * 1000 >= Date.now()
  );
};

export const browserApi = (auth: AuthApi, resolved: Resolved) => {
  const { scopes } = resolved;
  const describe = (names: string[]): ScopeView[] =>
    names.map((name) => ({ name, description: scopes?.[name] ?? name }));

  const browserAccounts = (request: Request) =>
    request.headers.get('cookie')
      ? auth.api.listDeviceSessions({ headers: request.headers })
      : Promise.resolve([]);

  const activeSession = (request: Request) =>
    request.headers.get('cookie')
      ? auth.api.getSession({ headers: request.headers })
      : Promise.resolve(null);

  const requireActive = async (request: Request) => {
    const active = await activeSession(request);
    if (!active) {
      throw new Failure(401, 'signed_out', 'No Account is signed in here.');
    }
    return active;
  };

  /** The Active Account, which must be the one the page shows: another
   * tab may have switched since the page loaded its lists. */
  const requireShown = async (request: Request, userId: string) => {
    const active = await requireActive(request);
    if (active.user.id !== userId) {
      throw new Failure(
        409,
        'account_changed',
        'The account signed in here changed. Look again before you act.',
      );
    }
    return active;
  };

  /** The Approving Account: that User's Sign-in on this browser. */
  const accountOf = async (request: Request, userId: string) => {
    const accounts = await browserAccounts(request);
    const account = accounts.find((entry) => entry.user.id === userId);
    if (!account) {
      throw new Failure(
        403,
        'account_not_signed_in',
        'That account is not signed in on this browser.',
      );
    }
    return { account, accounts };
  };

  /** Ends one Account's Sign-in on this browser. When it was the Active
   * Account, the next Account still signed in here becomes active. */
  const signOutAccount = async (request: Request, userId: string) => {
    const { account, accounts } = await accountOf(request, userId);
    const active = await activeSession(request);
    if (!active) {
      // better-auth's revoke needs an Active Account; without one the
      // Sign-in is simply ended.
      const { internalAdapter } = await auth.$context;
      await internalAdapter.deleteSession(account.session.token);
      return json({ active: null });
    }
    const revoked = await auth.api.revokeDeviceSession({
      headers: request.headers,
      body: { sessionToken: account.session.token },
      returnHeaders: true,
    });
    const cookies = revoked.headers.getSetCookie();
    if (active.user.id !== userId) {
      return json({ active: active.user.id }, 200, cookies);
    }
    const next = accounts.find((entry) => entry.user.id !== userId);
    if (!next) return json({ active: null }, 200, cookies);
    // Pick the next Account ourselves, so the answer names it.
    const switched = await auth.api.setActiveSession({
      headers: request.headers,
      body: { sessionToken: next.session.token },
      returnHeaders: true,
    });
    return json({ active: next.user.id }, 200, [
      ...cookies,
      ...switched.headers.getSetCookie(),
    ]);
  };

  const client = async (clientId: string): Promise<ClientView> => {
    const { adapter } = await auth.$context;
    const record = await adapter.findOne<ClientRecord>({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: clientId }],
    });
    return {
      id: clientId,
      name: record?.name || clientId,
      icon: record?.icon ?? null,
      uri: record?.uri ?? null,
    };
  };

  const findDeviceCode = async (userCode: string) => {
    const { adapter } = await auth.$context;
    for (const candidate of userCodeCandidates(userCode)) {
      const record = await adapter.findOne<DeviceCodeRecord>({
        model: 'deviceCode',
        where: [{ field: 'userCode', value: candidate }],
      });
      if (record?.userCode === candidate) return record;
    }
    return null;
  };

  const pendingDeviceCode = async (userCode: string) => {
    const record = await findDeviceCode(userCode);
    if (!record) {
      throw new Failure(400, 'invalid_code', 'That code is not valid.');
    }
    if (new Date(record.expiresAt) < new Date()) {
      throw new Failure(400, 'expired_code', 'That code has expired.');
    }
    return record;
  };

  /** What a page shows of this browser, read in-process by the pages'
   * Loaders as the endpoints below answer it; no answer carries a token. */
  const reads: BrowserReads = {
    accounts: async (request) => {
      const [accounts, active] = await Promise.all([
        browserAccounts(request),
        activeSession(request),
      ]);
      const activeId = active?.user.id ?? null;
      return {
        active: accounts.some((entry) => entry.user.id === activeId)
          ? activeId
          : null,
        accounts: accounts.map((entry) => accountView(entry.user)),
      };
    },
    signIns: async (request) => {
      const active = await requireActive(request);
      const { internalAdapter } = await auth.$context;
      const now = new Date();
      const sessions = (
        await internalAdapter.listSessions(active.user.id)
      ).filter((session) => new Date(session.expiresAt) > now);
      return sessions
        .map((session): SignInView => {
          const { name, kind } = signInName(session.userAgent);
          return {
            id: session.id,
            name,
            kind,
            current: session.id === active.session.id,
            createdAt: iso(session.createdAt),
            lastActiveAt: iso(session.updatedAt),
            expiresAt: iso(session.expiresAt),
          };
        })
        .sort(
          (a, b) =>
            Number(b.current) - Number(a.current) ||
            b.lastActiveAt.localeCompare(a.lastActiveAt),
        );
    },
    grants: async (request) => {
      const active = await requireActive(request);
      if (!scopes) return [];
      const { adapter } = await auth.$context;
      const consents = await adapter.findMany<ConsentRecord>({
        model: 'oauthConsent',
        where: [{ field: 'userId', value: active.user.id }],
      });
      const grants = await Promise.all(
        consents.map(async (consent): Promise<GrantView> => ({
          id: consent.id,
          client: await client(consent.clientId),
          scopes: describe(scopeList(consent.scopes)),
          grantedAt: iso(consent.createdAt),
        })),
      );
      return grants.sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
    },
    // Reads the record directly: better-auth's GET /device would claim the
    // code for whoever is active.
    deviceRequest: async (userCode) => {
      const record = await pendingDeviceCode(userCode);
      return {
        userCode: record.userCode,
        status: record.status,
        app: record.clientId ?? null,
      };
    },
    consentRequest: async (search) => {
      if (!auth.api.oauth2Consent) {
        throw new Failure(404, 'not_found', 'Not found.');
      }
      const signed = signedOAuthQuery(search);
      if (!(await verifySignedQuery(signed, resolved.config.secret))) {
        throw new Failure(
          400,
          'invalid_request',
          'This consent link is invalid or has expired.',
        );
      }
      const clientId = signed.get('client_id');
      if (!clientId) {
        throw new Failure(400, 'invalid_request', 'No client_id.');
      }
      return {
        client: await client(clientId),
        scopes: describe(
          (signed.get('scope') ?? '').split(' ').filter(Boolean),
        ),
      };
    },
  };

  const routes: Record<
    string,
    Partial<Record<'GET' | 'POST', (request: Request) => Promise<Response>>>
  > = {
    '/accounts': {
      GET: async (request) => json(await reads.accounts(request)),
    },
    '/accounts/switch': {
      POST: async (request) => {
        const userId = text(await readBody(request), 'userId');
        const { account } = await accountOf(request, userId);
        const { headers } = await auth.api.setActiveSession({
          headers: request.headers,
          body: { sessionToken: account.session.token },
          returnHeaders: true,
        });
        return json({ active: userId }, 200, headers.getSetCookie());
      },
    },
    '/accounts/sign-out': {
      POST: async (request) =>
        signOutAccount(request, text(await readBody(request), 'userId')),
    },
    '/sign-ins': {
      GET: async (request) => json({ signIns: await reads.signIns(request) }),
    },
    '/sign-ins/revoke': {
      POST: async (request) => {
        const body = await readBody(request);
        const id = text(body, 'id');
        const active = await requireShown(request, text(body, 'userId'));
        if (id === active.session.id) {
          return signOutAccount(request, active.user.id);
        }
        const { internalAdapter } = await auth.$context;
        const session = (
          await internalAdapter.listSessions(active.user.id)
        ).find((entry) => entry.id === id);
        if (!session) {
          throw new Failure(404, 'not_found', 'That sign-in is already gone.');
        }
        await internalAdapter.deleteSession(session.token);
        return json({ ok: true });
      },
    },
    '/sign-ins/revoke-others': {
      POST: async (request) => {
        const body = await readBody(request);
        const active = await requireShown(request, text(body, 'userId'));
        const { internalAdapter } = await auth.$context;
        const others = (
          await internalAdapter.listSessions(active.user.id)
        ).filter((entry) => entry.id !== active.session.id);
        await Promise.all(
          others.map((entry) => internalAdapter.deleteSession(entry.token)),
        );
        return json({ ok: true, revoked: others.length });
      },
    },
    '/grants': {
      GET: async (request) => json({ grants: await reads.grants(request) }),
    },
    '/grants/revoke': {
      POST: async (request) => {
        const body = await readBody(request);
        const id = text(body, 'id');
        const active = await requireShown(request, text(body, 'userId'));
        if (!scopes) throw new Failure(404, 'not_found', 'No such grant.');
        const { adapter } = await auth.$context;
        const consent = await adapter.findOne<ConsentRecord>({
          model: 'oauthConsent',
          where: [{ field: 'id', value: id }],
        });
        if (!consent || consent.userId !== active.user.id) {
          throw new Failure(404, 'not_found', 'That app has no access.');
        }
        await adapter.delete({
          model: 'oauthConsent',
          where: [{ field: 'id', value: id }],
        });
        // As grant-revocation does for better-auth's own delete-consent.
        const where = [
          { field: 'userId', value: consent.userId },
          { field: 'clientId', value: consent.clientId },
        ];
        await Promise.all(
          ['oauthRefreshToken', 'oauthAccessToken'].map((model) =>
            adapter.updateMany({
              model,
              where,
              update: { revoked: new Date() },
            }),
          ),
        );
        return json({ ok: true });
      },
    },
    '/device/request': {
      GET: async (request) => {
        const userCode = new URL(request.url).searchParams.get('user_code');
        if (!userCode) {
          throw new Failure(400, 'invalid_request', '"user_code" is required.');
        }
        return json(await reads.deviceRequest(userCode));
      },
    },
    '/device/answer': {
      POST: async (request) => {
        const body = await readBody(request);
        const userCode = text(body, 'userCode');
        const userId = text(body, 'userId');
        const approve = flag(body, 'approve');
        const { account, accounts } = await accountOf(request, userId);
        const record = await pendingDeviceCode(userCode);
        if (record.status !== 'pending') {
          throw new Failure(
            400,
            'already_answered',
            `That code was already ${record.status}.`,
          );
        }
        if (record.userId && record.userId !== userId) {
          // Claimed by another Account of this browser (a lookup through
          // better-auth while it was active): hand it to the chosen one.
          // A code claimed by anyone else stays theirs.
          if (!accounts.some((entry) => entry.user.id === record.userId)) {
            throw new Failure(
              403,
              'claimed',
              'Another account is already approving that code.',
            );
          }
          const { adapter } = await auth.$context;
          await adapter.update({
            model: 'deviceCode',
            where: [
              { field: 'id', value: record.id },
              { field: 'status', value: 'pending' },
            ],
            update: { userId },
          });
        }
        const headers = bearer(account.session.token);
        // Claims the code for the Approving Account, then answers as it.
        await auth.api.deviceVerify({
          headers,
          query: { user_code: record.userCode },
        });
        const answer = { headers, body: { userCode: record.userCode } };
        await (approve
          ? auth.api.deviceApprove(answer)
          : auth.api.deviceDeny(answer));
        return json({ status: approve ? 'approved' : 'denied' });
      },
    },
    '/consent/request': {
      GET: async (request) =>
        json(await reads.consentRequest(new URL(request.url).search)),
    },
    '/consent/answer': {
      POST: async (request) => {
        if (!auth.api.oauth2Consent) {
          throw new Failure(404, 'not_found', 'Not found.');
        }
        const body = await readBody(request);
        const query = text(body, 'query');
        const userId = text(body, 'userId');
        const accept = flag(body, 'accept');
        const { account } = await accountOf(request, userId);
        // Through the handler: the provider's authorize step needs a real
        // request.
        const response = await auth.handler(
          new Request(`${resolved.origin}${AUTH_API_PATH}/oauth2/consent`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${account.session.token}`,
              'content-type': 'application/json',
              accept: 'application/json',
              origin: resolved.origin,
            },
            body: JSON.stringify({
              accept,
              oauth_query: signedOAuthQuery(query).toString(),
            }),
          }),
        );
        const result = (await response.json().catch(() => ({}))) as {
          url?: string;
          redirect_uri?: string;
          error?: string;
          error_description?: string;
          message?: string;
        };
        if (!response.ok) {
          throw new Failure(
            response.status,
            result.error ?? 'failed',
            result.error_description ??
              result.message ??
              'Could not answer that request.',
          );
        }
        const url = result.url ?? result.redirect_uri;
        if (!url) {
          throw new Failure(500, 'server_error', 'No redirect was issued.');
        }
        return json({ url });
      },
    },
  };

  /** Answers one of these endpoints, or undefined for any other path.
   * `apiPath` is the path below `/api/auth`. */
  const handle = async (
    request: Request,
    apiPath: string,
  ): Promise<Response | undefined> => {
    const route = routes[apiPath];
    if (!route) return undefined;
    const endpoint = route[request.method as 'GET' | 'POST'];
    if (!endpoint) {
      return json(
        { error: 'method_not_allowed', message: 'Not allowed.' },
        405,
      );
    }
    // A state change must come from a page on the Shared Cookie Domain.
    if (
      request.method === 'POST' &&
      !resolved.isTrustedOrigin(request.headers.get('origin'))
    ) {
      return json({ error: 'forbidden', message: 'Untrusted origin.' }, 403);
    }
    try {
      return await endpoint(request);
    } catch (error) {
      if (error instanceof Failure) {
        return json(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      if (isAPIError(error)) {
        const body = (error.body ?? {}) as {
          code?: string;
          error?: string;
          message?: string;
          error_description?: string;
        };
        return json(
          {
            error: body.error ?? body.code?.toLowerCase() ?? 'failed',
            message: body.error_description ?? body.message ?? error.message,
          },
          error.statusCode,
        );
      }
      throw error;
    }
  };

  return { handle, reads };
};
