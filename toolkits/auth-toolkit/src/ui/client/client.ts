import {
  oauthDeviceAuthorizationClient,
  oauthProviderClient,
} from '@better-auth/oauth-provider/client';
import { createAuthClient } from 'better-auth/react';

interface Failure {
  message?: string | undefined;
  error_description?: string | undefined;
}

type Result<T> = Promise<{ data: T | null; error: Failure | null }>;

interface SessionState {
  data: {
    user: {
      email: string;
      name: string;
      image?: string | null | undefined;
    };
  } | null;
  isPending: boolean;
}

/** Typed by hand: Better Auth's inferred plugin types reach into zod
 * internals and break the package's declarations. */
export interface AuthorizationClient {
  useSession: () => SessionState;
  signIn: { social: (input: { provider: 'google' }) => Promise<unknown> };
  signOut: () => Promise<unknown>;
  oauth2: {
    publicClient: (input: {
      query: { client_id: string };
    }) => Result<{ client_name?: string | undefined }>;
    consent: (input: { accept: boolean }) => Result<{ url?: string }>;
  };
  device: {
    (input: { query: { user_code: string } }): Result<{
      status: string;
      client_id?: string | undefined;
      scope?: string | undefined;
    }>;
    approve: (input: { userCode: string }) => Result<unknown>;
    deny: (input: { userCode: string }) => Result<unknown>;
  };
}

export const createAuthorizationClient = (): AuthorizationClient =>
  createAuthClient({
    plugins: [oauthProviderClient(), oauthDeviceAuthorizationClient()],
  });

export const pageQuery = () =>
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);

export const navigate = (url: string) => {
  window.location.assign(url);
};
