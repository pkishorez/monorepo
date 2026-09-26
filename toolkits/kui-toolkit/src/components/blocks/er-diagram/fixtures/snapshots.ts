import type { SnapshotCheck, SnapshotType } from 'std-toolkit/eschema';
import type { TableSnapshot } from 'std-toolkit/snapshot';

type Primitive = 'boolean' | 'number' | 'string';

type Variant = {
  readonly tag: string;
  readonly fields: readonly Field[];
};

type Field = {
  readonly name: string;
  readonly schemaType?: SnapshotType;
  readonly type?: Primitive;
  readonly literal?: string;
  readonly optional?: boolean;
  readonly reference?: string;
  readonly checks?: readonly SnapshotCheck[];
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

function primitive(field: Field): SnapshotType {
  return {
    type: field.type ?? 'string',
    ...(field.reference === undefined
      ? {}
      : { entityReference: field.reference }),
    ...(field.checks === undefined ? {} : { checks: field.checks }),
  };
}

function fieldType(field: Field): SnapshotType {
  const item: SnapshotType =
    field.schemaType !== undefined
      ? field.schemaType
      : field.variants !== undefined
        ? {
            type: 'union',
            members: field.variants.map((variant) =>
              object([
                { name: 'kind', literal: variant.tag },
                ...variant.fields,
              ]),
            ),
          }
        : field.nested !== undefined
          ? object(field.nested)
          : field.literal !== undefined
            ? { type: 'literal', value: field.literal }
            : primitive(field);
  if (field.array) return { type: 'array', element: item };
  if (field.optional) {
    return { type: 'union', members: [item, { type: 'null' }] };
  }
  return item;
}

function object(fields: readonly Field[]): SnapshotType {
  return {
    type: 'struct',
    fields: fields
      .map((field) => ({ name: field.name, type: fieldType(field) }))
      .toSorted((left, right) => left.name.localeCompare(right.name)),
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
    versions: versions.map((version) => ({
      version: version.version,
      shape: object(
        keyed
          ? [
              { name: idField!, type: 'string' as const },
              ...version.fields.filter(({ name }) => name !== idField),
            ]
          : version.fields,
      ),
    })),
  };
}

function table(
  logicalName: string,
  entities: readonly Entity[],
): TableSnapshot {
  return {
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
    schemas: entities.map(schema),
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
      { name: 'name', checks: [{ check: 'minLength', minLength: 1 }] },
      {
        name: 'email',
        checks: [
          { check: 'custom', name: 'email', description: 'A valid address' },
          { check: 'maxLength', maxLength: 254 },
        ],
      },
      { name: 'active', type: 'boolean' },
    ],
  },
  {
    name: 'Order',
    fields: [
      { name: 'customerId', reference: 'Customer' },
      { name: 'status' },
      {
        name: 'total',
        type: 'number',
        checks: [{ check: 'greaterThanOrEqualTo', minimum: 0 }],
      },
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

const literalType = (value: string | number | boolean): SnapshotType => ({
  type: 'literal',
  value,
});

const referenceType = (target: string): SnapshotType => ({
  type: 'string',
  entityReference: target,
});

export const allDataTypesSnapshot = table('all-schema-data-types', [
  {
    name: 'AllDataTypes',
    fields: [
      { name: 'string', schemaType: { type: 'string' } },
      { name: 'number', schemaType: { type: 'number' } },
      { name: 'boolean', schemaType: { type: 'boolean' } },
      { name: 'null', schemaType: { type: 'null' } },
      { name: 'unknown', schemaType: { type: 'unknown' } },
      { name: 'stringLiteral', schemaType: literalType('draft') },
      { name: 'numberLiteral', schemaType: literalType(42) },
      { name: 'booleanLiteral', schemaType: literalType(true) },
      {
        name: 'literalUnion',
        schemaType: {
          type: 'union',
          members: [
            literalType('draft'),
            literalType('published'),
            literalType(0),
            literalType(false),
            { type: 'null' },
          ],
        },
      },
      {
        name: 'checkedString',
        schemaType: {
          type: 'string',
          checks: [
            { check: 'minLength', minLength: 1 },
            { check: 'maxLength', maxLength: 80 },
            { check: 'custom', name: 'slug', description: 'Lowercase words' },
          ],
        },
      },
      {
        name: 'checkedNumber',
        schemaType: {
          type: 'number',
          checks: [
            { check: 'int' },
            { check: 'between', minimum: 0, maximum: 100 },
          ],
        },
      },
      {
        name: 'primitiveArray',
        schemaType: { type: 'array', element: { type: 'string' } },
      },
      {
        name: 'objectArray',
        schemaType: {
          type: 'array',
          element: object([
            { name: 'label' },
            { name: 'ownerId', schemaType: referenceType('Identity') },
          ]),
        },
      },
      {
        name: 'record',
        schemaType: { type: 'record', value: { type: 'number' } },
      },
      {
        name: 'objectRecord',
        schemaType: {
          type: 'record',
          value: object([
            { name: 'enabled', type: 'boolean' },
            { name: 'accountId', schemaType: referenceType('Account') },
          ]),
        },
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
        schemaType: {
          type: 'union',
          members: [
            object([
              { name: 'kind', literal: 'structured' },
              { name: 'value' },
            ]),
            literalType('automatic'),
            { type: 'number' },
            referenceType('Policy'),
          ],
        },
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
