import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  GrantView,
  SessionView,
} from 'kui-toolkit/components/blocks/auth';

import {
  AuthorizationClientError,
  unwrap,
  type AuthorizationClient,
} from '../client/index.js';

const SESSIONS = ['auth-toolkit', 'sessions'] as const;
const GRANTS = ['auth-toolkit', 'grants'] as const;

const listGrants = async (client: AuthorizationClient) => {
  const records =
    (await unwrap(
      client.oauth2.getConsents(),
      'Could not load the apps with access.',
    )) ?? [];
  return Promise.all(
    records.map(async (record) => {
      const { data } = await client.oauth2.publicClient({
        query: { client_id: record.clientId },
      });
      return {
        id: record.id,
        view: {
          clientId: record.clientId,
          name: data?.client_name ?? record.clientId,
          scopes: record.scopes,
          grantedAt: new Date(record.createdAt),
        } satisfies GrantView,
      };
    }),
  );
};

const refresh = (queries: QueryClient) =>
  Promise.all([
    queries.invalidateQueries({ queryKey: SESSIONS }),
    queries.invalidateQueries({ queryKey: GRANTS }),
  ]);

export const needsReauthentication = (failure: unknown) =>
  failure instanceof AuthorizationClientError &&
  failure.code === 'SESSION_NOT_FRESH';

export type UserAccess =
  | { status: 'loading' }
  | { status: 'reauthenticate' }
  | { status: 'failed'; reason: string; retry: () => void }
  | {
      status: 'ready';
      sessions: SessionView[];
      grants: GrantView[] | undefined;
      revokeSession: (id: string) => Promise<unknown>;
      revokeOtherSessions: () => Promise<unknown>;
      revokeGrant: (clientId: string) => Promise<unknown>;
    };

export function useUserAccess(
  client: AuthorizationClient,
  options: { currentSessionId: string | undefined; grants: boolean },
): UserAccess {
  const queries = useQueryClient();
  const signedIn = options.currentSessionId !== undefined;

  const sessions = useQuery({
    queryKey: SESSIONS,
    enabled: signedIn,
    queryFn: async () =>
      (await unwrap(client.listSessions(), 'Could not load your sessions.')) ??
      [],
  });
  const grants = useQuery({
    queryKey: GRANTS,
    enabled: signedIn && options.grants,
    queryFn: () => listGrants(client),
  });

  const revoke = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSettled: () => refresh(queries),
  });

  const failure = sessions.error ?? grants.error;
  if (needsReauthentication(failure)) {
    return { status: 'reauthenticate' };
  }
  if (failure) {
    return {
      status: 'failed',
      reason: failure.message,
      retry: () => void refresh(queries),
    };
  }
  if (!sessions.data || (options.grants && !grants.data)) {
    return { status: 'loading' };
  }

  const records = sessions.data;
  const grantRecords = grants.data ?? [];
  return {
    status: 'ready',
    sessions: records.map((record): SessionView => ({
      id: record.id,
      userAgent: record.userAgent ?? null,
      current: record.id === options.currentSessionId,
      signedInAt: new Date(record.createdAt),
      lastActiveAt: new Date(record.updatedAt),
      expiresAt: new Date(record.expiresAt),
    })),
    grants: options.grants
      ? grantRecords.map((grant) => grant.view)
      : undefined,
    revokeSession: (id) =>
      revoke.mutateAsync(async () => {
        const record = records.find((session) => session.id === id);
        if (!record) return;
        await unwrap(
          client.revokeSession({ token: record.token }),
          'Could not revoke that session. Try again.',
        );
      }),
    revokeOtherSessions: () =>
      revoke.mutateAsync(() =>
        unwrap(
          client.revokeOtherSessions(),
          'Could not sign out your other sessions. Try again.',
        ),
      ),
    revokeGrant: (clientId) =>
      revoke.mutateAsync(async () => {
        const grant = grantRecords.find(
          (record) => record.view.clientId === clientId,
        );
        if (!grant) return;
        await unwrap(
          client.oauth2.deleteConsent({ id: grant.id }),
          'Could not revoke that app. Try again.',
        );
      }),
  };
}
