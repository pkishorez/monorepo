import type {
  ClientDiscovery,
  SchemaClient,
} from '@better-auth/oauth-provider';

/** A First-Party app that signs Users in as an OAuth client of its own, as a
 * native app does: a public client with PKCE, known to the Auth Worker in
 * advance, that never sees the Consent Screen. */
export interface FirstPartyClient {
  /** The `client_id` the app sends. */
  clientId: string;
  /** Shown on the Login Screen while it continues to the app. */
  name: string;
  /** Matched exactly; an app's own scheme (`ledger://oauth`) is allowed. */
  redirectUris: ReadonlyArray<string>;
  /** The one Resource Server its Access Tokens are for. Only this client
   * may get tokens for it. */
  resource: string;
  /** Seconds an Access Token lives. Read when its Resource Server is first
   * stored; a later change needs the stored row updated by hand.
   * @default 900 */
  accessTokenLifetime?: number | undefined;
}

export const DEFAULT_FIRST_PARTY_ACCESS_TOKEN_LIFETIME = 900;

const DISCOVERY_ID = 'first-party';

const SCOPES = ['openid', 'profile', 'email', 'offline_access'];

type ClientRow = SchemaClient<string[]>;

const rowOf = (client: FirstPartyClient) =>
  ({
    clientId: client.clientId,
    clientDiscoveryId: DISCOVERY_ID,
    name: client.name,
    redirectUris: [...client.redirectUris],
    scopes: SCOPES,
    tokenEndpointAuthMethod: 'none',
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    applicationType: 'native',
    requirePKCE: true,
    skipConsent: true,
    disabled: false,
    // Which Resource Server it was linked to, so a change relinks it.
    metadata: JSON.stringify({ resource: client.resource }),
  }) satisfies Partial<ClientRow>;

type Row = ReturnType<typeof rowOf>;

// JSON columns may come back parsed or as text, depending on the adapter.
const comparable = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value);

const same = (stored: ClientRow, wanted: Row) =>
  (Object.keys(wanted) as Array<keyof Row>).every(
    (key) => comparable(stored[key]) === comparable(wanted[key]),
  );

/** Finds each First-Party client by its id and keeps its stored record
 * matching the config: written on first use and whenever the config
 * changes, with its Resource Server linked, so the config is the only place
 * it is set. */
export const firstPartyClientDiscovery = (
  clients: ReadonlyArray<FirstPartyClient>,
): ClientDiscovery => {
  const byId = new Map(clients.map((client) => [client.clientId, client]));
  return {
    id: DISCOVERY_ID,
    matches: (clientId) => byId.has(clientId),
    resolve: async (ctx, clientId, existing) => {
      const client = byId.get(clientId);
      if (!client) return null;
      const wanted = rowOf(client);
      if (existing && same(existing, wanted)) return existing;

      const { adapter } = ctx.context;
      const now = new Date();
      if (existing) {
        await adapter.update({
          model: 'oauthClient',
          where: [{ field: 'clientId', value: clientId }],
          update: { ...wanted, updatedAt: now },
        });
      } else {
        await adapter.create({
          model: 'oauthClient',
          data: { ...wanted, createdAt: now, updatedAt: now },
        });
      }
      await adapter.deleteMany({
        model: 'oauthClientResource',
        where: [{ field: 'clientId', value: clientId }],
      });
      await adapter.create({
        model: 'oauthClientResource',
        data: { clientId, resourceId: client.resource, createdAt: now },
      });
      return adapter.findOne<ClientRow>({
        model: 'oauthClient',
        where: [{ field: 'clientId', value: clientId }],
      });
    },
  };
};

/** The Resource Servers First-Party clients own, with their token lifetime. */
export const firstPartyResources = (clients: ReadonlyArray<FirstPartyClient>) =>
  clients.map((client) => ({
    identifier: client.resource,
    accessTokenTtl:
      client.accessTokenLifetime ?? DEFAULT_FIRST_PARTY_ACCESS_TOKEN_LIFETIME,
  }));
