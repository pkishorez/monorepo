import { describe, expect, it } from 'vitest';
import type { SkillMetadata } from '../app-server/index.js';
import { mayNameSkill, toUserInput } from './input.js';

const skill = (name: string): SkillMetadata => ({
  name,
  description: `${name} skill`,
  path: `/skills/${name}/SKILL.md`,
  enabled: true,
});

const SKILLS = [skill('review'), skill('codex:rescue')];

describe('toUserInput', () => {
  it('turns a /name naming a known skill into $name and a skill item', () => {
    expect(
      toUserInput({ text: '/review the diff', images: [] }, SKILLS),
    ).toEqual([
      { type: 'text', text: '$review the diff', text_elements: [] },
      { type: 'skill', name: 'review', path: '/skills/review/SKILL.md' },
    ]);
  });

  it('finds skills mid-text, once each, names with colons included', () => {
    const input = toUserInput(
      {
        text: 'first /codex:rescue then\n/review and /review again',
        images: [],
      },
      SKILLS,
    );
    expect(input[0]).toEqual({
      type: 'text',
      text: 'first $codex:rescue then\n$review and $review again',
      text_elements: [],
    });
    expect(
      input.slice(1).map((item) => item.type === 'skill' && item.name),
    ).toEqual(['codex:rescue', 'review']);
  });

  it('leaves unknown names, paths and glued slashes as typed', () => {
    const text = 'see /unknown and src/review and a/review or /review, too';
    expect(toUserInput({ text, images: [] }, SKILLS)).toEqual([
      { type: 'text', text, text_elements: [] },
    ]);
  });

  it('sends images inline as data URLs, after the text', () => {
    expect(
      toUserInput(
        {
          text: 'what is this?',
          images: [{ name: 'a.png', mime: 'image/png', data: 'AAAA' }],
        },
        [],
      ),
    ).toEqual([
      { type: 'text', text: 'what is this?', text_elements: [] },
      { type: 'image', url: 'data:image/png;base64,AAAA' },
    ]);
  });
});

describe('mayNameSkill', () => {
  it.each([
    ['/review', true],
    ['please /review this', true],
    ['no skill here', false],
    ['a/path/like/this', false],
  ])('%s → %s', (text, expected) => expect(mayNameSkill(text)).toBe(expected));
});
