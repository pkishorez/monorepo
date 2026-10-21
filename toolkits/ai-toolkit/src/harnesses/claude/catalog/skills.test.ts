import { describe, expect, it } from 'vitest';
import { toSkills } from './skills.js';

describe('toSkills', () => {
  it('keeps commands a user, project or plugin defines, once each', () => {
    expect(
      toSkills([
        {
          name: 'clear',
          description: 'Clear',
          argumentHint: '',
          builtin: true,
        },
        { name: 'review', description: 'Review a diff', argumentHint: '<pr>' },
        { name: 'review', description: 'Shadowed', argumentHint: '' },
        { name: 'ship', description: 'Ship it', argumentHint: '' },
      ]),
    ).toEqual([
      { name: 'review', description: 'Review a diff', argumentHint: '<pr>' },
      { name: 'ship', description: 'Ship it' },
    ]);
  });
});
