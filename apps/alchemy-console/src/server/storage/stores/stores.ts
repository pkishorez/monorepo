import { Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';
import { consoleTable } from '../table/index.ts';

export const storeSchema = EntityESchema.make('store', 'id', {
  userId: Schema.String,
  name: Schema.String,
  // Where the Alchemy state lives, resolved once from the locating credential.
  state: Schema.Struct({
    provider: Schema.Literal('cloudflare'),
    credentialId: Schema.String,
    url: Schema.String,
    authToken: Schema.String,
  }),
  // Credential ids this store may use during deletion, beyond its state credential.
  grants: Schema.Array(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
}).build();

export const storeEntity = consoleTable
  .entity(storeSchema)
  .primary({ pk: ['userId'] })
  .build();
