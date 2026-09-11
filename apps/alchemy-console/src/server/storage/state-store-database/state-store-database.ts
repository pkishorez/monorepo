import { StdTable } from 'std-toolkit/db';
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
)
  .evolve(
    'v2',
    {
      connection: Schema.Struct({
        kind: Schema.Literal('cloudflare'),
        accountId: Schema.NullOr(Schema.String),
        apiToken: Schema.NullOr(Schema.String),
        url: Schema.String,
        authToken: Schema.String,
      }),
    },
    (previous) => ({
      ...previous,
      connection: { ...previous.connection, accountId: null, apiToken: null },
    }),
  )
  .evolve('v3', { access: Schema.Literals(['view', 'admin']) }, (previous) => ({
    ...previous,
    access: 'view' as const,
  }))
  // Every connection may delete; planning checks the token per resource instead.
  .evolve('v4', { access: null }, (previous) => {
    const { access, ...rest } = previous;
    void access;
    return rest;
  })
  .evolve(
    'v5',
    {
      aws: Schema.NullOr(
        Schema.Struct({
          type: Schema.Literal('aws'),
          accessKeyId: Schema.String,
          secretAccessKey: Schema.String,
          region: Schema.String,
        }),
      ),
    },
    (previous) => ({ ...previous, aws: null }),
  )
  .build();

export const appTable = StdTable.make('alchemy-console')
  .primary('pk', 'sk')
  .build();

export const alchemyStateStoreEntity = appTable
  .entity(alchemyStateStoreSchema)
  .primary({ pk: ['userId'] })
  .build();
