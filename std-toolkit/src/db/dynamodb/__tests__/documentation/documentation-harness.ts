import { Cause, Effect, References, Schema } from 'effect';

import type { TestValue } from 'laymos/report';

import {
  EntityESchema,
  SingleEntityESchema,
} from '../../../../eschema/index.js';
import {
  createDynamoDB,
  DynamoDB,
  DynamoTable,
  dynamoDBLayer,
  type EntityType,
  type SingleEntityType,
} from '../../index.js';

const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8090';
const userSchema = EntityESchema.make('DocumentedUser', 'userId', {
  organizationId: Schema.String,
  email: Schema.String,
  name: Schema.String,
  status: Schema.Literals(['active', 'inactive']),
  score: Schema.Number,
}).build();

const orderSchema = EntityESchema.make('DocumentedOrder', 'orderId', {
  userId: Schema.String,
  status: Schema.Literals(['pending', 'paid', 'cancelled']),
  total: Schema.Number,
}).build();

const settingsSchema = SingleEntityESchema.make('DocumentedSettings', {
  theme: Schema.Literals(['light', 'dark']),
  retries: Schema.Number,
}).build();

export interface DocumentedUser extends Readonly<Record<string, TestValue>> {
  readonly userId: string;
  readonly organizationId: string;
  readonly email: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
  readonly score: number;
}

export const user = (
  userId: string,
  overrides: Partial<DocumentedUser> = {},
): DocumentedUser => ({
  userId,
  organizationId: 'org-1',
  email: `${userId}@example.com`,
  name: `User ${userId}`,
  status: 'active',
  score: 10,
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

export function makeDocumentationHarness(slug: string) {
  const tableName = `docs-${slug}-${process.pid}-${Date.now()}`;
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

  const provide = <A, E>(effect: Effect.Effect<A, E, DynamoDB>) =>
    effect.pipe(
      Effect.provide(layer),
      Effect.provideService(References.MinimumLogLevel, 'None'),
    );

  return {
    table,
    users,
    orders,
    settings,
    create: () =>
      Effect.runPromise(
        client
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
          ),
      ),
    cleanup: () =>
      Effect.runPromise(
        client
          .deleteTable({ TableName: tableName })
          .pipe(Effect.catch(() => Effect.void)),
      ),
    clear: provide(table.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING')),
    provide,
  };
}

export type DocumentationHarness = ReturnType<typeof makeDocumentationHarness>;

export const normalizeEntity = (
  entity: EntityType<DocumentedUser> | null,
): TestValue => {
  if (entity === null) return null;
  return {
    value: withoutVersion(entity.value),
    meta: {
      entity: entity.meta._e,
      version: entity.meta._v,
      deleted: entity.meta._d,
      updateCursor: entity.meta._u === '' ? 'absent' : 'generated',
    },
  };
};

export const normalizeEntities = (
  entities: readonly EntityType<DocumentedUser>[],
): TestValue => entities.map(normalizeEntity);

export const normalizeSingleEntity = (
  entity: SingleEntityType<{
    readonly theme: 'light' | 'dark';
    readonly retries: number;
  }>,
): TestValue => ({
  value: {
    theme: entity.value.theme,
    retries: entity.value.retries,
  },
  meta: {
    entity: entity.meta._e,
    version: entity.meta._v,
    updateCursor: entity.meta._u === '' ? 'absent' : 'generated',
  },
});

export const normalizeTransactionEntities = (
  entities: readonly EntityType<unknown>[],
): TestValue =>
  entities.map((entity) => ({
    value: withoutVersion(entity.value as Record<string, unknown>),
    meta: {
      entity: entity.meta._e,
      version: entity.meta._v,
      deleted: entity.meta._d,
      updateCursor: entity.meta._u === '' ? 'absent' : 'generated',
    },
  }));

export const expectedEntity = (
  value: ReturnType<typeof user>,
  deleted = false,
): TestValue => ({
  value,
  meta: {
    entity: 'DocumentedUser',
    version: 'v1',
    deleted,
    updateCursor: 'generated',
  },
});

export const expectedSettings = (
  theme: 'light' | 'dark',
  retries: number,
  updateCursor: 'absent' | 'generated' = 'generated',
): TestValue => ({
  value: { theme, retries },
  meta: {
    entity: 'DocumentedSettings',
    version: 'v1',
    updateCursor,
  },
});

export const expectedTransactionEntity = (
  entity: 'DocumentedUser' | 'DocumentedOrder',
  value: Readonly<Record<string, TestValue>>,
  deleted = false,
): TestValue => ({
  value,
  meta: {
    entity,
    version: 'v1',
    deleted,
    updateCursor: 'generated',
  },
});

export const operationDocumentation = (
  summary: string,
  example: string,
  details: string,
) => `
${summary}

${details}

A typical use looks like this:

\`\`\`ts
${example.trim()}
\`\`\`

The scenarios below build on this example and show the important outcomes a
caller needs to understand.
`;

function withoutVersion<Value extends Record<string, unknown>>(
  value: Value,
): Record<string, TestValue> {
  const { _v: _, ...visible } = value;
  return visible as Record<string, TestValue>;
}
