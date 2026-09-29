import { defineRelationsPart, sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .default(false)
    .notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text('role'),
  banned: integer('banned', { mode: 'boolean' }).default(false),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp_ms' }),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('account_issuer_accountId_uidx').on(
      table.issuer,
      table.accountId,
    ),
    index('account_userId_idx').on(table.userId),
  ],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const deviceCode = sqliteTable(
  'device_code',
  {
    id: text('id').primaryKey(),
    deviceCode: text('device_code').notNull(),
    userCode: text('user_code').notNull(),
    userId: text('user_id'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    status: text('status').notNull(),
    lastPolledAt: integer('last_polled_at', { mode: 'timestamp_ms' }),
    pollingInterval: integer('polling_interval'),
    clientId: text('client_id'),
    scope: text('scope'),
  },
  (table) => [
    uniqueIndex('deviceCode_deviceCode_uidx').on(table.deviceCode),
    uniqueIndex('deviceCode_userCode_uidx').on(table.userCode),
  ],
);

export const jwks = sqliteTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  alg: text('alg'),
  crv: text('crv'),
});

export const oauthClient = sqliteTable(
  'oauth_client',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'),
    clientDiscoveryId: text('client_discovery_id'),
    disabled: integer('disabled', { mode: 'boolean' }).default(false),
    skipConsent: integer('skip_consent', { mode: 'boolean' }),
    enableEndSession: integer('enable_end_session', { mode: 'boolean' }),
    subjectType: text('subject_type'),
    scopes: text('scopes', { mode: 'json' }),
    clientCredentialsScopes: text('client_credentials_scopes', {
      mode: 'json',
    }).default([]),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: text('contacts', { mode: 'json' }),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('software_id'),
    softwareVersion: text('software_version'),
    softwareStatement: text('software_statement'),
    redirectUris: text('redirect_uris', { mode: 'json' }).notNull(),
    postLogoutRedirectUris: text('post_logout_redirect_uris', { mode: 'json' }),
    backchannelLogoutUri: text('backchannel_logout_uri'),
    backchannelLogoutSessionRequired: integer(
      'backchannel_logout_session_required',
      { mode: 'boolean' },
    ),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
    applicationType: text('application_type'),
    jwks: text('jwks'),
    jwksUri: text('jwks_uri'),
    grantTypes: text('grant_types', { mode: 'json' }),
    responseTypes: text('response_types', { mode: 'json' }),
    requirePKCE: integer('require_pkce', { mode: 'boolean' }),
    dpopBoundAccessTokens: integer('dpop_bound_access_tokens', {
      mode: 'boolean',
    }).default(false),
    referenceId: text('reference_id'),
    metadata: text('metadata', { mode: 'json' }),
  },
  (table) => [index('oauthClient_userId_idx').on(table.userId)],
);

export const oauthResource = sqliteTable('oauth_resource', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  accessTokenTtl: integer('access_token_ttl'),
  refreshTokenTtl: integer('refresh_token_ttl'),
  signingAlgorithm: text('signing_algorithm'),
  signingKeyId: text('signing_key_id'),
  allowedScopes: text('allowed_scopes', { mode: 'json' }),
  customClaims: text('custom_claims', { mode: 'json' }),
  dpopBoundAccessTokensRequired: integer('dpop_bound_access_tokens_required', {
    mode: 'boolean',
  }).default(false),
  disabled: integer('disabled', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  policyVersion: integer('policy_version').default(1),
  metadata: text('metadata', { mode: 'json' }),
});

export const oauthClientResource = sqliteTable(
  'oauth_client_resource',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: 'cascade' }),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('oauthClientResource_clientId_resourceId_uidx').on(
      table.clientId,
      table.resourceId,
    ),
    index('oauthClientResource_clientId_idx').on(table.clientId),
    index('oauthClientResource_resourceId_idx').on(table.resourceId),
  ],
);

export const oauthRefreshToken = sqliteTable(
  'oauth_refresh_token',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => session.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources', { mode: 'json' }),
    requestedUserInfoClaims: text('requested_user_info_claims', {
      mode: 'json',
    }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    revoked: integer('revoked', { mode: 'timestamp_ms' }),
    rotatedAt: integer('rotated_at', { mode: 'timestamp_ms' }),
    rotationReplayResponse: text('rotation_replay_response'),
    rotationReplayExpiresAt: integer('rotation_replay_expires_at', {
      mode: 'timestamp_ms',
    }),
    authTime: integer('auth_time', { mode: 'timestamp_ms' }),
    confirmation: text('confirmation', { mode: 'json' }),
    scopes: text('scopes', { mode: 'json' }).notNull(),
  },
  (table) => [
    index('oauthRefreshToken_clientId_idx').on(table.clientId),
    index('oauthRefreshToken_sessionId_idx').on(table.sessionId),
    index('oauthRefreshToken_userId_idx').on(table.userId),
    index('oauthRefreshToken_authorizationCodeId_idx').on(
      table.authorizationCodeId,
    ),
  ],
);

export const oauthAccessToken = sqliteTable(
  'oauth_access_token',
  {
    id: text('id').primaryKey(),
    token: text('token').unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => session.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources', { mode: 'json' }),
    requestedUserInfoClaims: text('requested_user_info_claims', {
      mode: 'json',
    }),
    refreshId: text('refresh_id').references(() => oauthRefreshToken.id, {
      onDelete: 'cascade',
    }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    revoked: integer('revoked', { mode: 'timestamp_ms' }),
    confirmation: text('confirmation', { mode: 'json' }),
    scopes: text('scopes', { mode: 'json' }).notNull(),
  },
  (table) => [
    index('oauthAccessToken_clientId_idx').on(table.clientId),
    index('oauthAccessToken_sessionId_idx').on(table.sessionId),
    index('oauthAccessToken_userId_idx').on(table.userId),
    index('oauthAccessToken_authorizationCodeId_idx').on(
      table.authorizationCodeId,
    ),
    index('oauthAccessToken_refreshId_idx').on(table.refreshId),
  ],
);

export const oauthConsent = sqliteTable(
  'oauth_consent',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    resources: text('resources', { mode: 'json' }),
    requestedUserInfoClaims: text('requested_user_info_claims', {
      mode: 'json',
    }),
    scopes: text('scopes', { mode: 'json' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('oauthConsent_clientId_idx').on(table.clientId),
    index('oauthConsent_userId_idx').on(table.userId),
  ],
);

export const oauthClientAssertion = sqliteTable('oauth_client_assertion', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

export const authRelations = defineRelationsPart(
  {
    user,
    session,
    account,
    verification,
    deviceCode,
    jwks,
    oauthClient,
    oauthResource,
    oauthClientResource,
    oauthRefreshToken,
    oauthAccessToken,
    oauthConsent,
    oauthClientAssertion,
  },
  (r) => ({
    user: {
      sessions: r.many.session({
        from: r.user.id,
        to: r.session.userId,
      }),
      accounts: r.many.account({
        from: r.user.id,
        to: r.account.userId,
      }),
      oauthClients: r.many.oauthClient({
        from: r.user.id,
        to: r.oauthClient.userId,
      }),
      oauthRefreshTokens: r.many.oauthRefreshToken({
        from: r.user.id,
        to: r.oauthRefreshToken.userId,
      }),
      oauthAccessTokens: r.many.oauthAccessToken({
        from: r.user.id,
        to: r.oauthAccessToken.userId,
      }),
      oauthConsents: r.many.oauthConsent({
        from: r.user.id,
        to: r.oauthConsent.userId,
      }),
    },
    session: {
      user: r.one.user({
        from: r.session.userId,
        to: r.user.id,
      }),
      oauthRefreshTokens: r.many.oauthRefreshToken({
        from: r.session.id,
        to: r.oauthRefreshToken.sessionId,
      }),
      oauthAccessTokens: r.many.oauthAccessToken({
        from: r.session.id,
        to: r.oauthAccessToken.sessionId,
      }),
    },
    account: {
      user: r.one.user({
        from: r.account.userId,
        to: r.user.id,
      }),
    },
    oauthClient: {
      user: r.one.user({
        from: r.oauthClient.userId,
        to: r.user.id,
      }),
      oauthClientResources: r.many.oauthClientResource({
        from: r.oauthClient.clientId,
        to: r.oauthClientResource.clientId,
      }),
      oauthRefreshTokens: r.many.oauthRefreshToken({
        from: r.oauthClient.clientId,
        to: r.oauthRefreshToken.clientId,
      }),
      oauthAccessTokens: r.many.oauthAccessToken({
        from: r.oauthClient.clientId,
        to: r.oauthAccessToken.clientId,
      }),
      oauthConsents: r.many.oauthConsent({
        from: r.oauthClient.clientId,
        to: r.oauthConsent.clientId,
      }),
    },
    oauthResource: {
      oauthClientResources: r.many.oauthClientResource({
        from: r.oauthResource.identifier,
        to: r.oauthClientResource.resourceId,
      }),
    },
    oauthClientResource: {
      oauthClient: r.one.oauthClient({
        from: r.oauthClientResource.clientId,
        to: r.oauthClient.clientId,
      }),
      oauthResource: r.one.oauthResource({
        from: r.oauthClientResource.resourceId,
        to: r.oauthResource.identifier,
      }),
    },
    oauthRefreshToken: {
      oauthClient: r.one.oauthClient({
        from: r.oauthRefreshToken.clientId,
        to: r.oauthClient.clientId,
      }),
      session: r.one.session({
        from: r.oauthRefreshToken.sessionId,
        to: r.session.id,
      }),
      user: r.one.user({
        from: r.oauthRefreshToken.userId,
        to: r.user.id,
      }),
      oauthAccessTokens: r.many.oauthAccessToken({
        from: r.oauthRefreshToken.id,
        to: r.oauthAccessToken.refreshId,
      }),
    },
    oauthAccessToken: {
      oauthClient: r.one.oauthClient({
        from: r.oauthAccessToken.clientId,
        to: r.oauthClient.clientId,
      }),
      session: r.one.session({
        from: r.oauthAccessToken.sessionId,
        to: r.session.id,
      }),
      user: r.one.user({
        from: r.oauthAccessToken.userId,
        to: r.user.id,
      }),
      oauthRefreshToken: r.one.oauthRefreshToken({
        from: r.oauthAccessToken.refreshId,
        to: r.oauthRefreshToken.id,
      }),
    },
    oauthConsent: {
      oauthClient: r.one.oauthClient({
        from: r.oauthConsent.clientId,
        to: r.oauthClient.clientId,
      }),
      user: r.one.user({
        from: r.oauthConsent.userId,
        to: r.user.id,
      }),
    },
  }),
);
