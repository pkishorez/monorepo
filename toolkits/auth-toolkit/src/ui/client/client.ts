import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { deviceAuthorizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

interface Failure {
  code?: string | undefined;
  message?: string | undefined;
  error_description?: string | undefined;
}

type Result<T> = Promise<{ data: T | null; error: Failure | null }>;

type Timestamp = Date | string;

interface SessionState {
  data: {
    user: {
      email: string;
      name: string;
      image?: string | null | undefined;
    };
    session: { id: string };
  } | null;
  isPending: boolean;
}

export interface SessionRecord {
  id: string;
  token: string;
  userAgent?: string | null | undefined;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
}

export interface GrantRecord {
  id: string;
  clientId: string;
  scopes: string[];
  createdAt: Timestamp;
}

/** Typed by hand: Better Auth's inferred plugin types reach into zod
 * internals and break the package's declarations. */
export interface AuthorizationClient {
  useSession: () => SessionState;
  signIn: {
    social: (input: {
      provider: 'google';
      callbackURL?: string | undefined;
    }) => Promise<unknown>;
  };
  signOut: () => Promise<unknown>;
  listSessions: () => Result<SessionRecord[]>;
  revokeSession: (input: { token: string }) => Result<unknown>;
  revokeOtherSessions: () => Result<unknown>;
  oauth2: {
    publicClient: (input: {
      query: { client_id: string };
    }) => Result<{ client_name?: string | undefined }>;
    consent: (input: { accept: boolean }) => Result<{ url?: string }>;
    getConsents: () => Result<GrantRecord[]>;
    deleteConsent: (input: { id: string }) => Result<unknown>;
  };
  device: {
    (input: { query: { user_code: string } }): Result<{
      status: string;
      client_id?: string | undefined;
    }>;
    approve: (input: { userCode: string }) => Result<unknown>;
    deny: (input: { userCode: string }) => Result<unknown>;
  };
}

export const createAuthorizationClient = (): AuthorizationClient =>
  createAuthClient({
    plugins: [oauthProviderClient(), deviceAuthorizationClient()],
  });

export class AuthorizationClientError extends Error {
  readonly name = 'AuthorizationClientError';

  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

export const unwrap = async <T>(result: Result<T>, fallback: string) => {
  const { data, error } = await result;
  if (error) {
    throw new AuthorizationClientError(
      error.error_description ?? error.message ?? fallback,
      error.code,
    );
  }
  return data;
};

export const pageQuery = () =>
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);

export const navigate = (url: string) => {
  window.location.assign(url);
};
