import { describe, expect, it } from 'vitest';

import {
  allDataTypesSnapshot,
  discriminatedPaymentSnapshot,
  nestedArraySnapshot,
} from '../fixtures/snapshots';
import { presentSnapshot } from './relationship-presentation';
import { annotatedSnapshot, nestedSnapshot, singleSnapshot } from './test-data';

describe('presentSnapshot', () => {
  it('turns field annotations into directed relationships', () => {
    const presentation = presentSnapshot(annotatedSnapshot);

    expect(presentation.relationships).toEqual([
      {
        id: 'Order:customerId->Customer',
        source: 'Order',
        sourceField: 'customerId',
        target: 'Customer',
        targetField: 'id',
      },
    ]);
  });

  it('presents nested fields as complex and keeps external targets visible', () => {
    const presentation = presentSnapshot(nestedSnapshot);

    expect(presentation.entities.map(({ id }) => id)).toContain(
      'external:Identity',
    );
    expect(presentation.relationships).toEqual([]);
    expect(presentation.entities[0]?.fields).toContainEqual({
      name: 'audit',
      type: 'complex',
      optional: false,
      complex: {
        kind: 'object',
        fields: [
          {
            name: 'actorId',
            type: 'string',
            optional: false,
            referenceTarget: 'Identity',
          },
        ],
      },
    });
  });

  it('presents a single entity without an identifier field', () => {
    const presentation = presentSnapshot(singleSnapshot);

    expect(presentation.entities[0]).toMatchObject({
      kind: 'single',
      idField: null,
      fields: [{ name: 'theme' }],
    });
  });

  it('preserves array structure and nested references for inspection', () => {
    const presentation = presentSnapshot(nestedArraySnapshot);
    const parcels = presentation.entities
      .find(({ id }) => id === 'ShipmentBatch')
      ?.fields.find(({ name }) => name === 'parcels');

    expect(parcels).toMatchObject({ type: 'complex[]' });
    expect(parcels?.complex).toMatchObject({
      kind: 'array',
      element: { kind: 'object' },
    });
    if (parcels?.complex?.kind !== 'array') throw new Error('Expected array');
    if (parcels.complex.element.kind !== 'object') {
      throw new Error('Expected array of objects');
    }
    expect(parcels.complex.element.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'orderId',
          referenceTarget: 'Order',
        }),
        expect.objectContaining({
          name: 'dimensions',
          complex: { kind: 'object', fields: expect.any(Array) },
        }),
      ]),
    );
    expect(presentation.relationships).toEqual([]);
  });

  it('preserves discriminated variants for inspection', () => {
    const presentation = presentSnapshot(discriminatedPaymentSnapshot);
    const method = presentation.entities
      .find(({ id }) => id === 'Payment')
      ?.fields.find(({ name }) => name === 'method');

    expect(method?.complex).toMatchObject({ kind: 'union' });
    if (method?.complex?.kind !== 'union') throw new Error('Expected union');
    const card = method.complex.variants.find(({ label }) => label === 'card');
    const bank = method.complex.variants.find(({ label }) => label === 'bank');
    expect(card?.type).toMatchObject({ kind: 'object' });
    expect(bank?.type).toMatchObject({ kind: 'object' });
    if (card?.type.kind !== 'object' || bank?.type.kind !== 'object') {
      throw new Error('Expected object variants');
    }
    expect(card.type.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'cardId', referenceTarget: 'Card' }),
      ]),
    );
    expect(bank.type.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'accountId',
          referenceTarget: 'BankAccount',
        }),
      ]),
    );
    expect(presentation.relationships).toEqual([]);
  });

  it('preserves literals, primitive union branches, and tuple references', () => {
    const presentation = presentSnapshot(allDataTypesSnapshot);
    const entity = presentation.entities.find(
      ({ id }) => id === 'AllDataTypes',
    );
    const literalUnion = entity?.fields.find(
      ({ name }) => name === 'literalUnion',
    );
    const mixedUnion = entity?.fields.find(({ name }) => name === 'mixedUnion');
    const tuple = entity?.fields.find(({ name }) => name === 'tuple');

    expect(literalUnion?.type).toBe('null | "draft" | "published" | 0 | false');
    expect(literalUnion?.complex).toMatchObject({
      kind: 'union',
      variants: [
        { label: '"draft"', type: { kind: 'type', type: '"draft"' } },
        {
          label: '"published"',
          type: { kind: 'type', type: '"published"' },
        },
        { label: '0', type: { kind: 'type', type: '0' } },
        { label: 'false', type: { kind: 'type', type: 'false' } },
        { label: 'null', type: { kind: 'type', type: 'null' } },
      ],
    });
    expect(mixedUnion?.complex).toMatchObject({
      kind: 'union',
      variants: [
        { label: 'structured', type: { kind: 'object' } },
        { label: '"automatic"', type: { kind: 'type', type: '"automatic"' } },
        { label: 'number', type: { kind: 'type', type: 'number' } },
        {
          label: 'string',
          type: {
            kind: 'type',
            type: 'string',
            referenceTarget: 'Policy',
          },
        },
      ],
    });
    expect(tuple).toMatchObject({
      referenceTarget: 'Account',
      complex: {
        kind: 'tuple',
        elements: [
          { kind: 'type', type: 'string' },
          { kind: 'type', type: 'string', referenceTarget: 'Account' },
          { kind: 'object' },
        ],
      },
    });
    expect(presentation.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceField: 'tuple',
          target: 'external:Account',
        }),
        expect.objectContaining({
          sourceField: 'mixedUnion',
          target: 'external:Policy',
        }),
      ]),
    );
  });
});
