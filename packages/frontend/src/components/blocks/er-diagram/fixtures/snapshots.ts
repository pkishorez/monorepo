import type { TableSnapshot } from 'std-toolkit/snapshot';

type Primitive = 'boolean' | 'number' | 'string';

type Variant = {
  readonly tag: string;
  readonly fields: readonly Field[];
};

type Field = {
  readonly name: string;
  readonly schemaType?: unknown;
  readonly type?: Primitive;
  readonly literal?: string;
  readonly optional?: boolean;
  readonly reference?: string;
  readonly array?: boolean;
  readonly nested?: readonly Field[];
  readonly variants?: readonly Variant[];
};

type EntityVersion = {
  readonly version: string;
  readonly fields: readonly Field[];
};

type Entity = {
  readonly name: string;
  readonly kind?: 'keyed' | 'single';
  readonly idField?: string;
  readonly fields: readonly Field[];
  readonly versions?: readonly EntityVersion[];
};

function primitive(type: Primitive = 'string', reference?: string): unknown {
  const tag = `${type[0]?.toUpperCase()}${type.slice(1)}`;
  return {
    _tag: tag,
    checks: [],
    ...(reference === undefined
      ? {}
      : { annotations: { entityReference: reference } }),
  };
}

function property(field: Field): unknown {
  const item =
    field.schemaType !== undefined
      ? field.schemaType
      : field.variants !== undefined
        ? {
            _tag: 'Union',
            checks: [],
            types: field.variants.map((variant) =>
              object([
                { name: 'kind', literal: variant.tag },
                ...variant.fields,
              ]),
            ),
          }
        : field.nested !== undefined
          ? object(field.nested)
          : field.literal !== undefined
            ? {
                _tag: 'Literal',
                checks: [],
                literal: { type: 'string', value: field.literal },
              }
            : primitive(field.type, field.reference);
  const type = field.array
    ? { _tag: 'Arrays', checks: [], elements: [], rest: [item] }
    : field.optional
      ? {
          _tag: 'Union',
          checks: [],
          types: [
            item,
            {
              _tag: 'Literal',
              checks: [],
              literal: { type: 'null', value: null },
            },
          ],
        }
      : item;
  return {
    isMutable: false,
    isOptional: false,
    name: { type: 'string', value: field.name },
    type,
  };
}

function object(fields: readonly Field[]): unknown {
  return {
    _tag: 'Objects',
    checks: [],
    indexSignatures: [],
    propertySignatures: fields.map(property),
  };
}

function schema(entity: Entity) {
  const keyed = entity.kind !== 'single';
  const idField = keyed ? (entity.idField ?? 'id') : null;
  const versions = entity.versions ?? [
    { version: 'v1', fields: entity.fields },
  ];
  return {
    identity: entity.name,
    kind: keyed ? ('entity' as const) : ('struct' as const),
    idField,
    versions: versions.map((version) => {
      const fields = keyed
        ? [
            { name: idField!, type: 'string' as const },
            ...version.fields.filter(({ name }) => name !== idField),
          ]
        : [...version.fields];
      return {
        version: version.version,
        encoded: {
          references: {},
          representation: {
            _tag: 'Objects',
            checks: [],
            indexSignatures: [],
            propertySignatures: [
              property({ name: '_v', literal: version.version }),
              ...fields.map(property),
            ],
          },
        },
        decoded: object(fields),
        transformations: [],
        unverifiable: [],
      };
    }),
  };
}

function table(
  logicalName: string,
  entities: readonly Entity[],
): TableSnapshot {
  return {
    _v: 'v2',
    kind: 'table',
    logicalName,
    topology: {
      primary: { pk: 'pk', sk: 'sk' },
      localSecondaryIndexes: [],
      globalSecondaryIndexes: [],
    },
    entities: entities.map((entity) => {
      if (entity.kind === 'single') {
        return {
          name: entity.name,
          kind: 'single',
          schema: entity.name,
          idField: null,
          primary: { pk: [], sk: [] },
          accessPatterns: [],
        };
      }
      const idField = entity.idField ?? 'id';
      return {
        name: entity.name,
        kind: 'keyed',
        schema: entity.name,
        idField,
        primary: { pk: [], sk: [idField] },
        accessPatterns: [
          {
            name: 'primary',
            kind: 'primary',
            pk: [],
            sk: [idField],
          },
        ],
      };
    }),
    schemas: entities.map(schema) as unknown as TableSnapshot['schemas'],
  };
}

export const emptySnapshot = table('empty-workspace', []);

export const singleSettingsSnapshot = table('application-settings', [
  {
    name: 'Settings',
    kind: 'single',
    fields: [
      { name: 'theme' },
      { name: 'maintenanceMode', type: 'boolean' },
      { name: 'supportEmail' },
      { name: 'maxUploadSize', type: 'number' },
    ],
  },
]);

export const simpleOrdersSnapshot = table('simple-orders', [
  {
    name: 'Customer',
    fields: [
      { name: 'name' },
      { name: 'email' },
      { name: 'active', type: 'boolean' },
    ],
  },
  {
    name: 'Order',
    fields: [
      { name: 'customerId', reference: 'Customer' },
      { name: 'status' },
      { name: 'total', type: 'number' },
    ],
  },
]);

export const versionedAccountsSnapshot = table('versioned-accounts', [
  {
    name: 'Organization',
    fields: [{ name: 'name' }],
  },
  {
    name: 'Account',
    fields: [
      { name: 'displayName' },
      { name: 'email' },
      { name: 'organizationId', reference: 'Organization' },
      { name: 'active', type: 'boolean' },
    ],
    versions: [
      {
        version: 'v1',
        fields: [{ name: 'displayName' }],
      },
      {
        version: 'v2',
        fields: [{ name: 'displayName' }, { name: 'email' }],
      },
      {
        version: 'v3',
        fields: [
          { name: 'displayName' },
          { name: 'email' },
          { name: 'organizationId', reference: 'Organization' },
          { name: 'active', type: 'boolean' },
        ],
      },
    ],
  },
]);

export const deeplyNestedSnapshot = table('nested-documents', [
  {
    name: 'Account',
    fields: [{ name: 'name' }],
  },
  {
    name: 'Document',
    fields: [
      { name: 'title' },
      {
        name: 'metadata',
        nested: [
          {
            name: 'owner',
            nested: [{ name: 'accountId', reference: 'Account' }],
          },
          {
            name: 'audit',
            nested: [
              { name: 'createdBy', reference: 'Identity' },
              { name: 'requestId' },
            ],
          },
        ],
      },
    ],
  },
]);

export const nestedArraySnapshot = table('shipment-batches', [
  {
    name: 'Order',
    fields: [{ name: 'number' }],
  },
  {
    name: 'ShipmentBatch',
    fields: [
      { name: 'status' },
      {
        name: 'parcels',
        array: true,
        nested: [
          { name: 'orderId', reference: 'Order' },
          { name: 'trackingNumber' },
          {
            name: 'dimensions',
            nested: [
              { name: 'width', type: 'number' },
              { name: 'height', type: 'number' },
            ],
          },
        ],
      },
    ],
  },
]);

export const discriminatedPaymentSnapshot = table('payment-methods', [
  {
    name: 'Card',
    fields: [{ name: 'lastFour' }],
  },
  {
    name: 'BankAccount',
    fields: [{ name: 'bankName' }],
  },
  {
    name: 'Payment',
    fields: [
      { name: 'amount', type: 'number' },
      {
        name: 'method',
        variants: [
          {
            tag: 'card',
            fields: [
              { name: 'cardId', reference: 'Card' },
              { name: 'capture', type: 'boolean' },
            ],
          },
          {
            tag: 'bank',
            fields: [
              { name: 'accountId', reference: 'BankAccount' },
              { name: 'routingNumber' },
            ],
          },
        ],
      },
    ],
  },
]);

export const cyclicTeamsSnapshot = table('cyclic-teams', [
  {
    name: 'Member',
    fields: [{ name: 'name' }, { name: 'teamId', reference: 'Team' }],
  },
  {
    name: 'Team',
    fields: [{ name: 'name' }, { name: 'leadId', reference: 'Member' }],
  },
]);

export const optionalBlogSnapshot = table('optional-blog', [
  {
    name: 'Author',
    fields: [{ name: 'displayName' }, { name: 'handle' }],
  },
  {
    name: 'Post',
    fields: [
      { name: 'title' },
      { name: 'authorId', reference: 'Author', optional: true },
      { name: 'published', type: 'boolean' },
    ],
  },
]);

export const arrayPlaylistSnapshot = table('playlists', [
  {
    name: 'Track',
    fields: [{ name: 'title' }, { name: 'duration', type: 'number' }],
  },
  {
    name: 'Playlist',
    fields: [
      { name: 'name' },
      { name: 'trackIds', reference: 'Track', array: true },
    ],
  },
]);

export const externalAuditSnapshot = table('audit-events', [
  {
    name: 'AuditEvent',
    fields: [
      { name: 'action' },
      {
        name: 'audit',
        nested: [
          { name: 'actorId', reference: 'Identity' },
          { name: 'requestId' },
        ],
      },
    ],
  },
]);

export const selfReferenceSnapshot = table('categories', [
  {
    name: 'Category',
    fields: [
      { name: 'name' },
      { name: 'parentId', reference: 'Category', optional: true },
    ],
  },
]);

const tagged = (tag: string, checks: readonly unknown[] = []) => ({
  _tag: tag,
  checks,
});

const literalType = (type: string, value: unknown) => ({
  _tag: 'Literal',
  checks: [],
  literal: { type, value },
});

const referenceType = (target: string) => ({
  ...tagged('String'),
  annotations: { entityReference: target },
});

const arrayType = (item: unknown) => ({
  ...tagged('Arrays'),
  elements: [],
  rest: [item],
});

const tupleType = (elements: readonly unknown[], rest: unknown[] = []) => ({
  ...tagged('Arrays'),
  elements,
  rest,
});

const unionType = (...types: readonly unknown[]) => ({
  ...tagged('Union'),
  types,
});

export const allDataTypesSnapshot = table('all-schema-data-types', [
  {
    name: 'AllDataTypes',
    fields: [
      { name: 'string', schemaType: tagged('String') },
      { name: 'number', schemaType: tagged('Number') },
      { name: 'boolean', schemaType: tagged('Boolean') },
      { name: 'bigint', schemaType: tagged('BigInt') },
      { name: 'symbol', schemaType: tagged('Symbol') },
      { name: 'undefined', schemaType: tagged('Undefined') },
      { name: 'void', schemaType: tagged('Void') },
      { name: 'never', schemaType: tagged('Never') },
      { name: 'unknown', schemaType: tagged('Unknown') },
      { name: 'any', schemaType: tagged('Any') },
      { name: 'stringLiteral', schemaType: literalType('string', 'draft') },
      { name: 'numberLiteral', schemaType: literalType('number', 42) },
      { name: 'booleanLiteral', schemaType: literalType('boolean', true) },
      { name: 'nullLiteral', schemaType: literalType('null', null) },
      {
        name: 'literalUnion',
        schemaType: unionType(
          literalType('string', 'draft'),
          literalType('string', 'published'),
          literalType('number', 0),
          literalType('boolean', false),
          literalType('null', null),
        ),
      },
      { name: 'primitiveArray', schemaType: arrayType(tagged('String')) },
      {
        name: 'objectArray',
        schemaType: arrayType(
          object([
            { name: 'label' },
            { name: 'ownerId', schemaType: referenceType('Identity') },
          ]),
        ),
      },
      {
        name: 'tuple',
        schemaType: tupleType([
          tagged('String'),
          referenceType('Account'),
          object([{ name: 'enabled', type: 'boolean' }]),
        ]),
      },
      {
        name: 'tupleWithRest',
        schemaType: tupleType(
          [literalType('string', 'head')],
          [tagged('Number')],
        ),
      },
      {
        name: 'nestedObject',
        nested: [
          { name: 'name' },
          { name: 'ownerId', reference: 'User' },
          { name: 'metadata', nested: [{ name: 'createdAt' }] },
        ],
      },
      {
        name: 'mixedUnion',
        schemaType: unionType(
          object([{ name: 'kind', literal: 'structured' }, { name: 'value' }]),
          literalType('string', 'automatic'),
          tagged('Number'),
          referenceType('Policy'),
        ),
      },
    ],
  },
]);

export const complexCommerceSnapshot = table('commerce-platform', [
  {
    name: 'CommerceSettings',
    kind: 'single',
    fields: [
      { name: 'currency' },
      { name: 'taxInclusive', type: 'boolean' },
      { name: 'defaultPageSize', type: 'number' },
    ],
  },
  {
    name: 'Customer',
    fields: [
      { name: 'name' },
      { name: 'email' },
      { name: 'defaultAddressId', reference: 'Address', optional: true },
    ],
  },
  {
    name: 'Address',
    fields: [
      { name: 'customerId', reference: 'Customer' },
      { name: 'line1' },
      { name: 'city' },
      { name: 'country' },
    ],
  },
  {
    name: 'Order',
    fields: [
      { name: 'customerId', reference: 'Customer' },
      { name: 'shippingAddressId', reference: 'Address' },
      { name: 'status' },
      { name: 'total', type: 'number' },
      {
        name: 'audit',
        nested: [
          { name: 'actorId', reference: 'Identity' },
          { name: 'requestId' },
        ],
      },
    ],
  },
  {
    name: 'OrderItem',
    fields: [
      { name: 'orderId', reference: 'Order' },
      { name: 'productId', reference: 'Product' },
      { name: 'quantity', type: 'number' },
      { name: 'unitPrice', type: 'number' },
    ],
  },
  {
    name: 'Product',
    fields: [
      { name: 'supplierId', reference: 'Supplier' },
      { name: 'categoryId', reference: 'Category' },
      { name: 'name' },
      { name: 'price', type: 'number' },
    ],
  },
  {
    name: 'Category',
    fields: [
      { name: 'name' },
      { name: 'parentId', reference: 'Category', optional: true },
    ],
  },
  {
    name: 'Supplier',
    fields: [
      { name: 'name' },
      { name: 'primaryContactId', reference: 'Identity' },
    ],
  },
  {
    name: 'Payment',
    fields: [
      { name: 'orderId', reference: 'Order' },
      { name: 'customerId', reference: 'Customer' },
      { name: 'status' },
      { name: 'amount', type: 'number' },
    ],
  },
  {
    name: 'Shipment',
    fields: [
      { name: 'orderId', reference: 'Order' },
      { name: 'addressId', reference: 'Address' },
      { name: 'trackingNumber' },
      { name: 'status' },
    ],
  },
  {
    name: 'Collection',
    fields: [
      { name: 'name' },
      { name: 'productIds', reference: 'Product', array: true },
    ],
  },
]);
