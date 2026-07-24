import { DatabaseSync } from 'node:sqlite';

import { Effect, Layer, Schema } from 'effect';

import type { TestValue } from 'laymos/report';

import {
  EntityESchema,
  SingleEntityESchema,
} from '../../../../eschema/index.js';
import { SQLiteTable } from '../../index.js';
import { nodeSqliteLayer } from '../../sql/adapters/node.js';
import { SqliteDB } from '../../sql/db.js';

const userSchema = EntityESchema.make('DocumentedUser', 'userId', {
  organizationId: Schema.String,
  email: Schema.String,
  name: Schema.String,
  status: Schema.Literals(['active', 'inactive']),
}).build();

const settingsSchema = SingleEntityESchema.make('DocumentedSettings', {
  theme: Schema.Literals(['light', 'dark']),
  retries: Schema.Number,
}).build();

export interface DocumentedUser {
  readonly userId: string;
  readonly organizationId: string;
  readonly email: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
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
  ...overrides,
});

export const makeDocumentationHarness = () => {
  const database = new DatabaseSync(':memory:');
  const layer: Layer.Layer<SqliteDB> = nodeSqliteLayer(
    database,
    'documented_items',
  );
  const table = SQLiteTable.make()
    .primary('pk', 'sk')
    .index('GSI1', 'GSI1PK', 'GSI1SK')
    .build();
  const users = table
    .entity(userSchema)
    .primary({ pk: ['organizationId'] })
    .index('GSI1', 'byStatus', { pk: ['status'], sk: ['email'] })
    .build();
  const settings = table
    .singleEntity(settingsSchema)
    .default({ theme: 'light', retries: 3 });
  const provide = <A, E>(effect: Effect.Effect<A, E, SqliteDB>) =>
    effect.pipe(Effect.provide(layer));

  return {
    users,
    settings,
    setup: provide(table.setup()),
    clear: provide(table.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING')),
    transact: (operations: Parameters<typeof table.transact>[0]) =>
      provide(table.transact(operations)),
    provide,
    close: () => database.close(),
  };
};

export const normalizeEntity = (
  entity: {
    readonly value: Readonly<Record<string, unknown>>;
    readonly meta: {
      readonly _e: string;
      readonly _v: string;
      readonly _u: string;
      readonly _d: boolean;
    };
  } | null,
): TestValue => {
  if (entity === null) return null;
  const { _v: _, ...value } = entity.value;
  return {
    value: value as Record<string, TestValue>,
    meta: {
      entity: entity.meta._e,
      version: entity.meta._v,
      deleted: entity.meta._d,
      updateCursor: entity.meta._u === '' ? 'absent' : 'generated',
    },
  };
};

export const normalizeSettings = (entity: {
  readonly value: {
    readonly theme: 'light' | 'dark';
    readonly retries: number;
  };
  readonly meta: {
    readonly _e: string;
    readonly _v: string;
    readonly _u: string;
  };
}): TestValue => {
  const { _v: _, ...value } = entity.value as typeof entity.value & {
    readonly _v?: string;
  };
  return {
    value,
    meta: {
      entity: entity.meta._e,
      version: entity.meta._v,
      updateCursor: entity.meta._u === '' ? 'absent' : 'generated',
    },
  };
};

export const expectedEntity = (
  value: DocumentedUser,
  deleted = false,
): TestValue => ({
  value: value as unknown as Record<string, TestValue>,
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

export const storageDocumentation = (
  introduction: string,
  mentalModel: string,
  example: string,
  boundaries: string,
) => `
${introduction}

${mentalModel}

\`\`\`ts
${example.trim()}
\`\`\`

${boundaries}
`;
