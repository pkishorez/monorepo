import { describe, expect, it } from 'vitest';

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
    expect(presentation.relationships[0]).toMatchObject({
      sourceField: 'audit',
      target: 'external:Identity',
      targetField: null,
    });
    expect(presentation.entities[0]?.fields).toContainEqual({
      name: 'audit',
      type: 'complex',
      optional: false,
      referenceTarget: 'Identity',
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
});
