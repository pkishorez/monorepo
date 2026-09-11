import { Effect } from 'effect';
import type { HttpClient } from 'effect/unstable/http';
import {
  ProviderFailure,
  type ProviderKind,
  type credentialSecret,
} from '../../../shared/contracts/credentials/index.ts';
import { cloudflare } from '../cloudflare/index.ts';
import { aws } from '../aws/index.ts';

export type Secret = typeof credentialSecret.Type;
/** A saved credential with its secret, as deletion and discovery consume it. */
export type Credential = {
  id: string;
  name: string;
  account: string;
  secret: Secret;
};
type Row = {
  status?: string;
  props?: unknown;
  attr?: unknown;
  removalPolicy?: string;
};

const providers = { cloudflare, aws };
export const providerFor = (kind: ProviderKind) => providers[kind];

/** Which provider a recorded resource type belongs to, or null for Alchemy-only types. */
export const providerOf = (resourceType: string): ProviderKind | null =>
  cloudflare.owns(resourceType)
    ? 'cloudflare'
    : aws.owns(resourceType)
      ? 'aws'
      : null;

/** Console can delete this type through one of its providers. */
export const supportsDeletion = (resourceType: string) =>
  cloudflare.supports(resourceType) || aws.supports(resourceType);

/** The account (and region, where the provider has one) a resource was recorded in. */
export const locate = (resourceType: string, row: Row) => {
  const kind = providerOf(resourceType);
  return kind ? providerFor(kind).locate(row) : { account: null, region: null };
};

/** Asks the provider which account owns the secret; fails when the provider rejects it. */
export const verify = (
  secret: Secret,
): Effect.Effect<
  { account: string },
  ProviderFailure,
  HttpClient.HttpClient
> =>
  secret.provider === 'cloudflare'
    ? cloudflare.verify(secret)
    : aws.verify(secret);

/** Finds the Alchemy state store hosted in a credential's account. */
export const locateStateStore = (secret: Secret) =>
  secret.provider === 'cloudflare'
    ? cloudflare.locateStateStore(secret)
    : Effect.fail(
        new ProviderFailure({
          code: 'failed',
          reason: 'Only Cloudflare accounts host Alchemy state stores.',
        }),
      );

/** Pre-deletion check for one row using the credential chosen for its provider. */
export const check = (
  credential: Credential,
  region: string | null,
  row: Row,
) =>
  credential.secret.provider === 'cloudflare'
    ? cloudflare.check(credential.secret, region, row)
    : aws.check(credential.secret, region, row);

/** The Alchemy provider layer for one credential. */
export const layer = (credential: Credential, region: string | null) =>
  credential.secret.provider === 'cloudflare'
    ? cloudflare.layer(credential.secret, region)
    : aws.layer(credential.secret, region);

export const needsRegion = (kind: ProviderKind) =>
  providerFor(kind).needsRegion;
