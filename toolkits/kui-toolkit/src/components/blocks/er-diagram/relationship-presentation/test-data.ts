import type { TableSnapshot } from 'std-toolkit/snapshot';

const stringType = (referenceTarget?: string) => ({
  _tag: 'String',
  checks: [],
  ...(referenceTarget === undefined
    ? {}
    : { annotations: { entityReference: referenceTarget } }),
});

const property = (name: string, type: unknown) => ({
  isMutable: false,
  isOptional: false,
  name: { type: 'string', value: name },
  type,
});

const object = (properties: readonly unknown[]) => ({
  _tag: 'Objects',
  checks: [],
  indexSignatures: [],
  propertySignatures: properties,
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
      encoded: {
        references: {},
        representation: object([
          property('_v', {
            _tag: 'Literal',
            checks: [],
            literal: { type: 'string', value: 'v1' },
          }),
          property('id', stringType()),
          ...fields,
        ]),
      },
      decoded: object([property('id', stringType()), ...fields]),
      transformations: [],
      unverifiable: [],
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
  versions: [
    {
      version: 'v1',
      encoded: {
        references: {},
        representation: object([
          property('_v', {
            _tag: 'Literal',
            checks: [],
            literal: { type: 'string', value: 'v1' },
          }),
          ...fields,
        ]),
      },
      decoded: object(fields),
      transformations: [],
      unverifiable: [],
    },
  ],
});

const base = {
  _v: 'v2' as const,
  kind: 'table' as const,
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
