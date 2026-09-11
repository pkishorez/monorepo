import { Schema } from 'effect';

const nonEmpty = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0),
);
export const providerKinds = ['cloudflare', 'aws'] as const;
export const providerKind = Schema.Literals(providerKinds);
export type ProviderKind = (typeof providerKinds)[number];
export const providerLabels: Record<ProviderKind, string> = {
  cloudflare: 'Cloudflare',
  aws: 'AWS',
};
/** Which provider a resource type belongs to, by its `Cloudflare.` or `AWS.` prefix. */
export const providerOfResourceType = (
  resourceType: string,
): ProviderKind | null =>
  resourceType.startsWith('Cloudflare.')
    ? 'cloudflare'
    : resourceType.startsWith('AWS.')
      ? 'aws'
      : null;

export const cloudflareAccountId = Schema.String.check(
  Schema.makeFilter((value) => /^[a-f0-9]{32}$/i.test(value)),
);
export const cloudflareSecret = Schema.Struct({
  provider: Schema.Literal('cloudflare'),
  accountId: cloudflareAccountId,
  apiToken: nonEmpty,
});
export const awsSecret = Schema.Struct({
  provider: Schema.Literal('aws'),
  accessKeyId: nonEmpty,
  secretAccessKey: nonEmpty,
});
export const credentialSecret = Schema.Union([cloudflareSecret, awsSecret]);

export const createCredentialInput = Schema.Struct({
  name: nonEmpty,
  secret: credentialSecret,
});
// An omitted secret keeps the saved one; a new secret is verified before it replaces it.
export const updateCredentialInput = Schema.Struct({
  id: nonEmpty,
  name: nonEmpty,
  secret: Schema.optional(credentialSecret),
});

/** A credential as the browser sees it: identity only, never a secret. */
export const credentialView = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  name: Schema.String,
  provider: providerKind,
  account: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export class CredentialError extends Schema.Error<CredentialError>(
  'alchemy-console/CredentialError',
)({
  _tag: Schema.tag('CredentialError'),
  reason: Schema.optional(Schema.String),
  code: Schema.Literals([
    'not-found',
    'storage-error',
    'verification-failed',
    'in-use',
  ]),
}) {}

/** How a provider reports a rejected credential or a missing state store. */
export class ProviderFailure extends Schema.Error<ProviderFailure>(
  'alchemy-console/ProviderFailure',
)({
  _tag: Schema.tag('ProviderFailure'),
  code: Schema.Literals(['permission', 'not-found', 'failed']),
  reason: Schema.String,
}) {}
