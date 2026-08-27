import { describe, expect, it } from 'vitest';

import { formatSchemaType } from './schema-fields';

const string = { _tag: 'String', checks: [] };
const nullLiteral = {
  _tag: 'Literal',
  checks: [],
  literal: { type: 'null', value: null },
};
const complex = {
  _tag: 'Objects',
  checks: [],
  propertySignatures: [],
};

describe('formatSchemaType', () => {
  it('uses a simple label for nested and discriminated structures', () => {
    expect(formatSchemaType(complex)).toBe('complex');
    expect(
      formatSchemaType({
        _tag: 'Union',
        checks: [],
        types: [complex, complex],
      }),
    ).toBe('complex');
  });

  it('marks arrays of structures as complex arrays', () => {
    expect(
      formatSchemaType({
        _tag: 'Arrays',
        checks: [],
        elements: [],
        rest: [complex],
      }),
    ).toBe('complex[]');
  });

  it('puts null first in nullable labels', () => {
    expect(
      formatSchemaType({
        _tag: 'Union',
        checks: [],
        types: [string, nullLiteral],
      }),
    ).toBe('null | string');
  });
});
