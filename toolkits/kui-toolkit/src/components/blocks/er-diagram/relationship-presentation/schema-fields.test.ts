import type { SnapshotType } from 'std-toolkit/eschema';
import { describe, expect, it } from 'vitest';

import { formatSchemaType, schemaFields } from './schema-fields';

const complex: SnapshotType = { type: 'struct', fields: [] };

describe('formatSchemaType', () => {
  it('uses a simple label for nested and discriminated structures', () => {
    expect(formatSchemaType(complex)).toBe('complex');
    expect(
      formatSchemaType({ type: 'union', members: [complex, complex] }),
    ).toBe('complex');
  });

  it('marks arrays of structures as complex arrays', () => {
    expect(formatSchemaType({ type: 'array', element: complex })).toBe(
      'complex[]',
    );
  });

  it('puts null first in nullable labels', () => {
    expect(
      formatSchemaType({
        type: 'union',
        members: [{ type: 'string' }, { type: 'null' }],
      }),
    ).toBe('null | string');
  });
});

describe('schemaFields', () => {
  it('presents each check with a readable label', () => {
    const [field] = schemaFields({
      type: 'struct',
      fields: [
        {
          name: 'title',
          type: {
            type: 'string',
            checks: [
              { check: 'minLength', minLength: 1 },
              { check: 'custom', name: 'slug', description: 'Lowercase words' },
            ],
          },
        },
      ],
    });

    expect(field?.checks).toEqual([
      { name: 'minLength', label: 'min length 1' },
      { name: 'slug', label: 'slug', description: 'Lowercase words' },
    ]);
  });

  it('reads an entity reference through a nullable union', () => {
    const [field] = schemaFields({
      type: 'struct',
      fields: [
        {
          name: 'ownerId',
          type: {
            type: 'union',
            members: [
              { type: 'string', entityReference: 'User' },
              { type: 'null' },
            ],
          },
        },
      ],
    });

    expect(field?.referenceTarget).toBe('User');
  });
});
