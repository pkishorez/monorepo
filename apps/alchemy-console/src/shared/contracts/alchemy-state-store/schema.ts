import { Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';

export const alchemyStateStoreSchema = EntityESchema.make(
  'alchemyStateStore',
  'id',
  {
    userId: Schema.String,
    name: Schema.String,
    connection: Schema.Struct({
      kind: Schema.Literal('cloudflare'),
      url: Schema.String,
      authToken: Schema.String,
    }),
    createdAt: Schema.String,
    updatedAt: Schema.String,
  },
).build();
