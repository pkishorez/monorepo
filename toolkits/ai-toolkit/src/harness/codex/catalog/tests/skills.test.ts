import { describe, expect, it } from 'vitest';
import { firstByName } from '../skills.js';

const skill = (name: string, path: string) => ({
  name,
  description: name,
  path,
  enabled: true,
});

describe('firstByName', () => {
  it('keeps the first Skill Codex lists under each name', () => {
    expect(
      firstByName([
        skill('pdf', '/a/pdf/SKILL.md'),
        skill('review', '/a/review/SKILL.md'),
        skill('pdf', '/b/pdf/SKILL.md'),
      ]).map(({ name, path }) => `${name} ${path}`),
    ).toEqual(['pdf /a/pdf/SKILL.md', 'review /a/review/SKILL.md']);
  });
});
