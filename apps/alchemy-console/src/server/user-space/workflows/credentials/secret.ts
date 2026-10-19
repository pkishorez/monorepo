import { Schema } from 'effect';
import {
  AwsSecret,
  CloudflareSecret,
  type NewCredential,
  type Provider,
} from '../../../../shared/contracts/credential/index.ts';

/*
 * A credential's keys as the Vault seals them: JSON of the provider's own
 * secret fields, trimmed as they were verified. The account ID and region
 * are not secret; they are stored beside it, in the clear.
 */

/** The JSON to seal for `input`. */
export const secretOf = (input: NewCredential) =>
  JSON.stringify(
    input.provider === 'cloudflare'
      ? {
          accountId: input.secret.accountId.trim().toLowerCase(),
          apiToken: input.secret.apiToken.trim(),
        }
      : {
          accessKeyId: input.secret.accessKeyId.trim(),
          secretAccessKey: input.secret.secretAccessKey.trim(),
          ...(input.secret.sessionToken?.trim()
            ? { sessionToken: input.secret.sessionToken.trim() }
            : {}),
        },
  );

const decodeCloudflare = Schema.decodeUnknownSync(
  Schema.fromJsonString(CloudflareSecret),
);
const decodeAws = Schema.decodeUnknownSync(Schema.fromJsonString(AwsSecret));

/** The environment a run of the project's own Alchemy gets for these keys. */
export const envOf = (
  provider: Provider,
  opened: string,
  region: string | null,
): Record<string, string> => {
  if (provider === 'cloudflare') {
    const secret = decodeCloudflare(opened);
    return {
      CLOUDFLARE_ACCOUNT_ID: secret.accountId,
      CLOUDFLARE_API_TOKEN: secret.apiToken,
    };
  }
  const secret = decodeAws(opened);
  return {
    AWS_ACCESS_KEY_ID: secret.accessKeyId,
    AWS_SECRET_ACCESS_KEY: secret.secretAccessKey,
    AWS_REGION: region ?? '',
    ...(secret.sessionToken ? { AWS_SESSION_TOKEN: secret.sessionToken } : {}),
  };
};
