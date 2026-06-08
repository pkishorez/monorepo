import { describe, expect, it } from 'vitest';
import { parseDirectives } from '@monorepo/vtest/analysis';

describe('parseDirectives', () => {
  it('extracts ids and offsets', () => {
    const md =
      'intro\n\n::test-group{id=case-a}\n\nmore\n\n::test-group{id=case-b}\n';
    const result = parseDirectives(md);
    expect(result.map((r) => r.id)).toEqual(['case-a', 'case-b']);
    expect(result[0]!.offset).toBe(md.indexOf('::test-group{id=case-a}'));
    expect(result[1]!.offset).toBe(md.indexOf('::test-group{id=case-b}'));
  });

  it('tolerates whitespace around id', () => {
    const result = parseDirectives('::test-group{ id = my-case }');
    expect(result.map((r) => r.id)).toEqual(['my-case']);
  });

  it('ignores directives inside fenced code blocks', () => {
    const md = [
      '::test-group{id=real}',
      '',
      '```md',
      '::test-group{id=fenced}',
      '```',
      '',
      '~~~',
      '::test-group{id=tilde-fenced}',
      '~~~',
    ].join('\n');
    expect(parseDirectives(md).map((r) => r.id)).toEqual(['real']);
  });

  it('returns empty for markdown with no directives', () => {
    expect(parseDirectives('# just a heading\n\nprose')).toEqual([]);
  });
});
