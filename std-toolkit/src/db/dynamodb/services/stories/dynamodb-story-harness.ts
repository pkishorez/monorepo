import { strict as assert } from 'node:assert';

import { Cause, Effect, Layer, Schema } from 'effect';

import {
  EntityESchema,
  SingleEntityESchema,
} from '../../../../eschema/index.js';
import {
  createDynamoDB,
  DynamoDB,
  DynamoTable,
  dynamoDBLayer,
  type DynamodbError,
} from '../../index.js';

const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8090';

const userSchema = EntityESchema.make('StoryUser', 'userId', {
  organizationId: Schema.String,
  email: Schema.String,
  name: Schema.String,
  status: Schema.Literals(['active', 'inactive']),
  score: Schema.Number,
  tags: Schema.Array(Schema.String),
}).build();

const orderSchema = EntityESchema.make('StoryOrder', 'orderId', {
  userId: Schema.String,
  status: Schema.Literals(['pending', 'paid', 'cancelled']),
  total: Schema.Number,
}).build();

const settingsSchema = SingleEntityESchema.make('StorySettings', {
  theme: Schema.Literals(['light', 'dark']),
  retries: Schema.Number,
}).build();

export type StoryUser = {
  readonly userId: string;
  readonly organizationId: string;
  readonly email: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
  readonly score: number;
  readonly tags: readonly string[];
};

export const user = (
  userId: string,
  overrides: Partial<StoryUser> = {},
): StoryUser => ({
  userId,
  organizationId: 'org-1',
  email: `${userId}@example.com`,
  name: `User ${userId}`,
  status: 'active',
  score: 10,
  tags: ['new'],
  ...overrides,
});

export const order = (
  orderId: string,
  overrides: Partial<{
    readonly userId: string;
    readonly status: 'pending' | 'paid' | 'cancelled';
    readonly total: number;
  }> = {},
) => ({
  orderId,
  userId: 'user-1',
  status: 'pending' as const,
  total: 100,
  ...overrides,
});

export function makeDynamoStoryHarness(slug: string) {
  const tableName = `laymos-${slug}-${process.pid}-${Date.now()}`;
  const connection = {
    tableName,
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'local',
      secretAccessKey: 'local',
    },
    endpoint,
  };
  const table = DynamoTable.make()
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .build();
  const users = table
    .entity(userSchema)
    .primary({ pk: ['organizationId'] })
    .index('GSI1', 'byStatus', { pk: ['status'], sk: ['email'] })
    .build();
  const orders = table
    .entity(orderSchema)
    .primary({ pk: ['userId'] })
    .build();
  const settings = table
    .singleEntity(settingsSchema)
    .default({ theme: 'light', retries: 3 });
  const client = createDynamoDB(connection);
  const layer = dynamoDBLayer(connection);
  const missingLayer = dynamoDBLayer({
    ...connection,
    tableName: `${tableName}-missing`,
  });

  const createTable = client
    .createTable({
      TableName: tableName,
      ...table.getTableSchema(),
      BillingMode: 'PAY_PER_REQUEST',
    })
    .pipe(
      Effect.catchCause((cause) =>
        Effect.fail(
          new Error(
            `DynamoDB Local is required at ${endpoint}: ${Cause.pretty(cause)}`,
          ),
        ),
      ),
    );

  const deleteTable = client
    .deleteTable({ TableName: tableName })
    .pipe(Effect.catch(() => Effect.void));

  return {
    tableName,
    table,
    users,
    orders,
    settings,
    layer,
    missingLayer,
    prepare: <A>(
      value: A,
      seed: Effect.Effect<unknown, unknown, DynamoDB> = Effect.void,
    ) => createTable.pipe(Effect.andThen(seed), Effect.as(value)),
    cleanup: () => deleteTable,
  };
}

export type DynamoStoryHarness = ReturnType<typeof makeDynamoStoryHarness>;

export const assertDynamoError = (
  error: unknown,
  tag: DynamodbError['error']['_tag'],
) =>
  Effect.sync(() => {
    assert.equal((error as DynamodbError).error._tag, tag);
  });

export const assertNonEmptyCursor = (cursor: string) => {
  assert.notEqual(cursor, '');
};

export const missingTableLayer = (harness: DynamoStoryHarness) =>
  Layer.succeed(DynamoDB, {
    tableName: `${harness.tableName}-missing`,
    client: createDynamoDB({
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local',
      },
      endpoint,
    }),
  });
