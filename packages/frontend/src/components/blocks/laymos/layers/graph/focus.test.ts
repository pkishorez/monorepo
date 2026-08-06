import { describe, expect, test } from 'vitest';

import { resolveGraphFocus, ruleId } from './focus';

const rules = [
  { fromLayerId: 'presentation', toLayerIds: ['application'] },
  { fromLayerId: 'application', toLayerIds: ['domain'] },
] as const;

describe('resolveGraphFocus', () => {
  test('active layer takes precedence and includes only direct neighbors', () => {
    const focus = resolveGraphFocus({
      rules,
      activeLayerId: 'presentation',
      hoveredLayerId: 'application',
    });

    expect(focus.highlightedLayerIds).toEqual(
      new Set(['presentation', 'application']),
    );
    expect(focus.highlightedRuleIds).toEqual(
      new Set([ruleId('presentation', 'application')]),
    );
  });

  test('a violation suppresses layer focus', () => {
    const focus = resolveGraphFocus({
      rules,
      activeLayerId: 'application',
      hoveredLayerId: 'presentation',
      activeViolationPair: {
        id: 'domain-to-application',
        fromLayerId: 'domain',
        toLayerId: 'application',
        violations: [],
      },
    });

    expect(focus.focusedLayerId).toBeUndefined();
    expect(focus.highlightedLayerIds).toEqual(
      new Set(['domain', 'application']),
    );
  });
});
