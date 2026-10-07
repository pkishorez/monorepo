import { authWorkerApiUrl } from '../../../contract/index.js';

/** The Auth Worker answered with an OAuth error, such as `invalid_grant`
 * for a refresh token that was revoked or already used. */
export class OAuthRefused extends Error {
  readonly name = 'OAuthRefused';
  constructor(
    readonly code: string,
    description: string | undefined,
  ) {
    super(description ?? code);
  }
}

export interface TokenSet {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** When the Access Token stops working, in ms since the epoch. */
  readonly expiresAt: number;
}

export interface UserInfo {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
}

interface Client {
  readonly authWorkerUrl: string;
  readonly clientId: string;
  readonly resource: string;
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

const refusedOrThrow = async (response: Response) => {
  if (response.ok) return;
  let body: { error?: string; error_description?: string } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // Not an OAuth error body.
  }
  if (body.error) throw new OAuthRefused(body.error, body.error_description);
  throw new Error(`The Auth Worker answered ${response.status}`);
};

const post = async (
  client: Client,
  path: string,
  form: Record<string, string>,
) => {
  const response = await client.fetch(
    authWorkerApiUrl(client.authWorkerUrl, path),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams(form).toString(),
    },
  );
  await refusedOrThrow(response);
  return response;
};

const tokenSetOf = async (client: Client, response: Response) => {
  const body = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  if (!body.refresh_token) {
    throw new OAuthRefused('invalid_grant', 'No refresh token was issued');
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: client.now() + body.expires_in * 1000,
  } satisfies TokenSet;
};

/** The Auth Worker's OAuth endpoints, as a public client sees them. */
export const tokenEndpoint = (client: Client) => ({
  authorizationEndpoint: authWorkerApiUrl(
    client.authWorkerUrl,
    '/oauth2/authorize',
  ),

  exchange: async (
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<TokenSet> =>
    tokenSetOf(
      client,
      await post(client, '/oauth2/token', {
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id: client.clientId,
        resource: client.resource,
      }),
    ),

  /** Trades a refresh token for a new pair; the old one is spent. */
  refresh: async (refreshToken: string): Promise<TokenSet> =>
    tokenSetOf(
      client,
      await post(client, '/oauth2/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: client.clientId,
        resource: client.resource,
      }),
    ),

  revoke: async (refreshToken: string): Promise<void> => {
    await post(client, '/oauth2/revoke', {
      token: refreshToken,
      token_type_hint: 'refresh_token',
      client_id: client.clientId,
    });
  },

  userInfo: async (accessToken: string): Promise<UserInfo> => {
    const response = await client.fetch(
      authWorkerApiUrl(client.authWorkerUrl, '/oauth2/userinfo'),
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    await refusedOrThrow(response);
    const claims = (await response.json()) as {
      sub: string;
      name?: string;
      email?: string;
      picture?: string | null;
    };
    return {
      id: claims.sub,
      name: claims.name ?? '',
      email: claims.email ?? '',
      image: claims.picture ?? null,
    };
  },
});

export type TokenEndpoint = ReturnType<typeof tokenEndpoint>;
