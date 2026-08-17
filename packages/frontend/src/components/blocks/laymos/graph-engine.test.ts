import { describe, expect, test } from 'vitest';

import { graphGroups } from './graph-engine';
import type { Layer, LayerRule } from './layers/model';

function layer(id: string): Layer {
  return { id, scopes: [] };
}

const layerGraphs = [
  {
    id: 'core',
    rules: [{ fromLayerId: 'app', toLayerIds: ['domain'] }] as LayerRule[],
  },
  {
    id: 'tests',
    rules: [{ fromLayerId: 'e2e', toLayerIds: ['fixtures'] }] as LayerRule[],
  },
];

describe('graphGroups', () => {
  test('keeps every LayerGraph when all its Layers are visible', () => {
    const actual = graphGroups({
      layers: [layer('app'), layer('domain'), layer('e2e'), layer('fixtures')],
      rules: [],
      layerGraphs,
    });

    expect(actual.map(({ id }) => id)).toEqual(['core', 'tests']);
  });

  test('drops a LayerGraph whose Layers are all filtered out', () => {
    const actual = graphGroups({
      layers: [layer('app'), layer('domain')],
      rules: [],
      layerGraphs,
    });

    expect(actual.map(({ id }) => id)).toEqual(['core']);
  });

  test('keeps a LayerGraph when only some of its Layers are visible', () => {
    const actual = graphGroups({
      layers: [layer('e2e')],
      rules: [],
      layerGraphs,
    });

    expect(actual.map(({ id }) => id)).toEqual(['tests']);
    expect(actual[0]?.layerIds).toEqual(['e2e']);
  });

  test('drops a LayerGraph left holding only a Layer that spans its neighbours', () => {
    const shared = [
      {
        id: 'std-table',
        rules: [
          { fromLayerId: 'entity', toLayerIds: ['definition'] },
        ] as LayerRule[],
      },
      {
        id: 'dynamodb',
        rules: [
          { fromLayerId: 'dynamodb', toLayerIds: ['definition'] },
        ] as LayerRule[],
      },
    ];

    const actual = graphGroups({
      layers: [layer('entity'), layer('definition')],
      rules: [],
      layerGraphs: shared,
    });

    expect(actual.map(({ id }) => id)).toEqual(['std-table']);
  });

  test('keeps a LayerGraph that owns a Layer of its own', () => {
    const shared = [
      {
        id: 'std-table',
        rules: [
          { fromLayerId: 'entity', toLayerIds: ['definition'] },
        ] as LayerRule[],
      },
      {
        id: 'dynamodb',
        rules: [
          { fromLayerId: 'dynamodb', toLayerIds: ['definition'] },
        ] as LayerRule[],
      },
    ];

    const actual = graphGroups({
      layers: [layer('entity'), layer('definition'), layer('dynamodb')],
      rules: [],
      layerGraphs: shared,
    });

    expect(actual.map(({ id }) => id)).toEqual(['std-table', 'dynamodb']);
  });

  test('keeps every LayerGraph when none of them owns a Layer alone', () => {
    const shared = [
      {
        id: 'one',
        rules: [{ fromLayerId: 'a', toLayerIds: ['b'] }] as LayerRule[],
      },
      {
        id: 'two',
        rules: [{ fromLayerId: 'a', toLayerIds: ['b'] }] as LayerRule[],
      },
    ];

    const actual = graphGroups({
      layers: [layer('a'), layer('b')],
      rules: [],
      layerGraphs: shared,
    });

    expect(actual.map(({ id }) => id)).toEqual(['one', 'two']);
  });

  test('still groups Layers no LayerGraph references', () => {
    const actual = graphGroups({
      layers: [layer('app'), layer('domain'), layer('orphan')],
      rules: [],
      layerGraphs,
    });

    expect(actual.map(({ id }) => id)).toEqual(['core', 'other-layers']);
  });
});
