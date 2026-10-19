import { Schema } from 'effect';

/*
 * A Provider credential: a named, user-owned set of keys for one account at
 * one provider. The browser only ever sees a summary of it: its name and
 * the account the provider confirmed. The keys go in once, with `NewCredential`,
 * and never come back out.
 */

export const Provider = Schema.Literals(['cloudflare', 'aws']);
export type Provider = typeof Provider.Type;

/** A credential as the browser sees it: never its secret. */
export const CredentialSummary = Schema.Struct({
  credentialId: Schema.String,
  name: Schema.String,
  provider: Provider,
  /** The account the provider confirmed the keys belong to. */
  accountId: Schema.String,
  /** The Cloudflare account's name; null for AWS. */
  accountName: Schema.NullOr(Schema.String),
  /** The AWS region the keys were confirmed in; null for Cloudflare. */
  region: Schema.NullOr(Schema.String),
  /** In milliseconds since the epoch. */
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
});
export type CredentialSummary = typeof CredentialSummary.Type;

export const CloudflareSecret = Schema.Struct({
  accountId: Schema.String,
  apiToken: Schema.String,
});

export const AwsSecret = Schema.Struct({
  accessKeyId: Schema.String,
  secretAccessKey: Schema.String,
  sessionToken: Schema.optional(Schema.String),
});

/** What the browser sends to add a credential: verified with the provider before it is kept. */
export const NewCredential = Schema.Union([
  Schema.Struct({
    provider: Schema.Literal('cloudflare'),
    name: Schema.String,
    secret: CloudflareSecret,
  }),
  Schema.Struct({
    provider: Schema.Literal('aws'),
    name: Schema.String,
    secret: AwsSecret,
    region: Schema.String,
  }),
]);
export type NewCredential = typeof NewCredential.Type;

/** A field of the add-credential form, so an error can sit under it. */
export const CredentialField = Schema.Literals([
  'name',
  'accountId',
  'apiToken',
  'accessKeyId',
  'secretAccessKey',
  'sessionToken',
  'region',
]);
export type CredentialField = typeof CredentialField.Type;

/** Why a credential call was refused, and which field to fix, when one is to blame. */
export class CredentialError extends Schema.Error<CredentialError>(
  'alchemy-console/CredentialError',
)({
  _tag: Schema.tag('CredentialError'),
  reason: Schema.Literals([
    /** The input is malformed; nothing was asked of the provider. */
    'invalid',
    /** The provider refused the keys. */
    'rejected',
    /** The provider could not be reached. */
    'unreachable',
    'not-found',
    /** A project deploys with it. */
    'in-use',
  ]),
  field: Schema.NullOr(CredentialField),
  message: Schema.String,
}) {}

const NAME_LIMIT = 64;

/** What is wrong with a credential's name, or null. */
export const nameProblem = (name: string): string | null => {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Give it a name.';
  if (trimmed.length > NAME_LIMIT)
    return `Keep the name under ${NAME_LIMIT} characters.`;
  return null;
};

const problem = (field: CredentialField, message: string) => ({
  field,
  message,
});

/**
 * The first field of `input` that cannot be right, as the form shows it, or
 * null. The browser checks it before sending, and the User Space again.
 */
export const inputProblem = (
  input: NewCredential,
): { readonly field: CredentialField; readonly message: string } | null => {
  const name = nameProblem(input.name);
  if (name !== null) return problem('name', name);
  if (input.provider === 'cloudflare') {
    if (!/^[a-f0-9]{32}$/i.test(input.secret.accountId.trim()))
      return problem(
        'accountId',
        'An account ID is 32 letters and digits, from the account’s overview page.',
      );
    if (input.secret.apiToken.trim().length === 0)
      return problem('apiToken', 'Paste the API token.');
    return null;
  }
  if (!/^[A-Z0-9]{16,128}$/.test(input.secret.accessKeyId.trim()))
    return problem(
      'accessKeyId',
      'An access key ID is 16 or more capital letters and digits, like AKIA….',
    );
  if (input.secret.secretAccessKey.trim().length === 0)
    return problem('secretAccessKey', 'Paste the secret access key.');
  if (!/^[a-z]{2}(-gov|-iso[a-z]*)?-[a-z]+-[0-9]$/.test(input.region.trim()))
    return problem('region', 'Use a region code, like us-east-1.');
  return null;
};
