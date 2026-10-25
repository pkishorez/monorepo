import { describe, expect, it } from 'vitest';
import { changed } from '../turn-options.js';

const current = {
  model: 'claude-opus-5-5',
  effort: 'high',
  permissionMode: 'bypassPermissions',
} as const;

describe('changed', () => {
  it('is empty when nothing differs', () => {
    expect(changed(current, {})).toEqual({});
    expect(changed(current, { ...current })).toEqual({});
  });

  it('keeps only what differs', () => {
    expect(
      changed(current, {
        model: 'claude-haiku-5-5',
        effort: 'high',
        permissionMode: 'plan',
      }),
    ).toEqual({ model: 'claude-haiku-5-5', permissionMode: 'plan' });
  });
});
