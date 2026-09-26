import type { TableSnapshot } from 'std-toolkit/snapshot';

const stringType = (referenceTarget?: string) => ({
  type: 'string' as const,
  ...(referenceTarget === undefined
    ? {}
    : { entityReference: referenceTarget }),
});

const property = (name: string, type: unknown) => ({ name, type });

const object = (properties: readonly { readonly name: string }[]) => ({
  type: 'struct' as const,
  fields: [...properties].sort((a, b) => a.name.localeCompare(b.name)),
});

const definition = (
  name: string,
  fields: readonly ReturnType<typeof property>[],
) => ({
  identity: name,
  kind: 'entity' as const,
  idField: 'id',
  versions: [
    {
      version: 'v1',
      shape: object([property('id', stringType()), ...fields]),
    },
  ],
});

const entity = (name: string) => ({
  name,
  kind: 'keyed' as const,
  schema: name,
  idField: 'id',
  primary: { pk: [], sk: ['id'] },
  accessPatterns: [
    { name: 'primary', kind: 'primary' as const, pk: [], sk: ['id'] },
  ],
});

const singleDefinition = (
  name: string,
  fields: readonly ReturnType<typeof property>[],
) => ({
  identity: name,
  kind: 'struct' as const,
  idField: null,
  versions: [{ version: 'v1', shape: object(fields) }],
});

const base = {
  topology: {
    primary: { pk: 'pk', sk: 'sk' },
    localSecondaryIndexes: [],
    globalSecondaryIndexes: [],
  },
};

export const annotatedSnapshot: TableSnapshot = {
  ...base,
  logicalName: 'orders',
  entities: [entity('Customer'), entity('Order')],
  schemas: [
    definition('Customer', [property('name', stringType())]),
    definition('Order', [property('customerId', stringType('Customer'))]),
  ] as unknown as TableSnapshot['schemas'],
};

export const singleSnapshot: TableSnapshot = {
  ...base,
  logicalName: 'settings',
  entities: [
    {
      name: 'Settings',
      kind: 'single',
      schema: 'Settings',
      idField: null,
      primary: { pk: [], sk: [] },
      accessPatterns: [],
    },
  ],
  schemas: [
    singleDefinition('Settings', [property('theme', stringType())]),
  ] as unknown as TableSnapshot['schemas'],
};

export const nestedSnapshot: TableSnapshot = {
  ...base,
  logicalName: 'audit',
  entities: [entity('Event')],
  schemas: [
    definition('Event', [
      property('audit', object([property('actorId', stringType('Identity'))])),
    ]),
  ] as unknown as TableSnapshot['schemas'],
};

export const selfReferenceSnapshot: TableSnapshot = {
  ...base,
  logicalName: 'categories',
  entities: [entity('Category')],
  schemas: [
    definition('Category', [
      property('name', stringType()),
      property('parentId', stringType('Category')),
    ]),
  ] as unknown as TableSnapshot['schemas'],
};
