import { Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';
import { consoleTable } from '../table/index.ts';

// Stored secrets per provider. Views never include this field.
export const storedSecret = Schema.Union([
  Schema.Struct({
    provider: Schema.Literal('cloudflare'),
    accountId: Schema.String,
    apiToken: Schema.String,
  }),
  Schema.Struct({
    provider: Schema.Literal('aws'),
    accessKeyId: Schema.String,
    secretAccessKey: Schema.String,
  }),
]);

export const credentialSchema = EntityESchema.make('credential', 'id', {
  userId: Schema.String,
  name: Schema.String,
  // The account the provider confirmed for this secret when it was saved.
  account: Schema.String,
  secret: storedSecret,
  createdAt: Schema.String,
  updatedAt: Schema.String,
}).build();

export const credentialEntity = consoleTable
  .entity(credentialSchema)
  .primary({ pk: ['userId'] })
  .build();
