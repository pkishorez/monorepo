import { describe, expect, test } from 'vitest';

import { resolveLayerFocus } from './focus';

describe('resolveLayerFocus', () => {
  test('uses hover only before a layer is active', () => {
    expect(resolveLayerFocus({ hoveredLayerId: 'domain' })).toEqual({
      focusedLayerId: 'domain',
      hoverEnabled: true,
      activationEnabled: true,
    });

    expect(
      resolveLayerFocus({
        activeLayerId: 'application',
        hoveredLayerId: 'domain',
      }),
    ).toEqual({
      focusedLayerId: 'application',
      hoverEnabled: false,
      activationEnabled: true,
    });
  });

  test('blocks all layer interaction when a higher-priority state is active', () => {
    expect(
      resolveLayerFocus({
        activeLayerId: 'application',
        hoveredLayerId: 'domain',
        blocked: true,
      }),
    ).toEqual({ hoverEnabled: false, activationEnabled: false });
  });
});
