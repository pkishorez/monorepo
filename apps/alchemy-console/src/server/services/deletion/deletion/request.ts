import { Schema } from 'effect';
import { credentialSecret } from '../../../../shared/contracts/credentials/index.ts';
import { credentialChoice } from '../../../../shared/contracts/deletion/index.ts';

const nonEmpty = Schema.String.check(
  Schema.makeFilter((s) => s.length > 0 && s.length <= 4096),
);
export const deletionRequest = Schema.Struct({
  stack: nonEmpty,
  stage: Schema.String.check(
    Schema.makeFilter((stage) => stage.length > 0 && stage.length <= 512),
  ),
  fingerprint: Schema.optional(Schema.String),
  forget: Schema.optional(
    Schema.Array(Schema.Struct({ id: nonEmpty, type: nonEmpty })),
  ),
  credentials: Schema.optional(Schema.Array(credentialChoice)),
  state: Schema.Struct({
    url: Schema.String.check(
      Schema.makeFilter((value) => {
        try {
          const url = new URL(value);
          return (
            url.protocol === 'https:' &&
            url.hostname.endsWith('.workers.dev') &&
            !url.port &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash &&
            url.pathname === '/'
          );
        } catch {
          return false;
        }
      }),
    ),
    authToken: nonEmpty,
  }),
  stateCredentialId: nonEmpty,
  // Every credential the store may use, with secrets; the engine picks per provider.
  available: Schema.Array(
    Schema.Struct({
      id: nonEmpty,
      name: Schema.String,
      account: Schema.String,
      secret: credentialSecret,
    }),
  ),
});
