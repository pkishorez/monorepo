import { describe, expect, test } from 'vitest';

import {
  combineLayerGraphRules,
  layersReferencedByRules,
} from './layer-graphs';

describe('layer graph selection', () => {
  test('unions rules without duplicating targets', () => {
    expect(
      combineLayerGraphRules([
        {
          id: 'architecture',
          rules: [{ fromLayerId: 'app', toLayerIds: ['domain'] }],
        },
        {
          id: 'integrations',
          rules: [
            { fromLayerId: 'app', toLayerIds: ['domain', 'infrastructure'] },
          ],
        },
      ]),
    ).toEqual([
      { fromLayerId: 'app', toLayerIds: ['domain', 'infrastructure'] },
    ]);
  });

  test('keeps only layers referenced by one graph', () => {
    expect(
      layersReferencedByRules(
        [
          { id: 'app', scopes: [] },
          { id: 'domain', scopes: [] },
          { id: 'unused', scopes: [] },
        ],
        [{ fromLayerId: 'app', toLayerIds: ['domain'] }],
      ).map((layer) => layer.id),
    ).toEqual(['app', 'domain']);
  });
});
