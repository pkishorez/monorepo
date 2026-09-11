import { Schema } from 'effect';
import { awsConnection } from '../../../../shared/contracts/state-stores/index.ts';

const nonEmpty = Schema.String.check(
  Schema.makeFilter((s) => s.length > 0 && s.length <= 4096),
);
export const destructionRequest = Schema.Struct({
  aws: Schema.optional(Schema.NullOr(awsConnection)),
  stack: nonEmpty,
  stage: Schema.String.check(
    Schema.makeFilter((stage) => stage.length > 0 && stage.length <= 512),
  ),
  fingerprint: Schema.optional(Schema.String),
  connection: Schema.Struct({
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
    apiToken: nonEmpty,
    accountId: Schema.String.check(
      Schema.makeFilter((s) => /^[a-f0-9]{32}$/i.test(s)),
    ),
  }),
});
