import { describe, expect, it } from 'vitest';
import { clock, count, length, shorten, size, stamp, took } from '../format.ts';
import { summaryMarkdown, transcriptMarkdown } from '../markdown.ts';
import { cutPrompt, retryPrompt, summaryPrompt } from '../prompts.ts';

describe('format', () => {
  it('writes times, lengths, durations, counts and sizes plainly', () => {
    expect(stamp(4.4)).toBe('00:00:04');
    expect(stamp(11560)).toBe('03:12:40');
    expect(clock(721)).toBe('0:12:01');
    expect(length(11560)).toBe('3:12:40');
    expect(length(245)).toBe('4:05');
    expect(took(12.2)).toBe('12s');
    expect(took(185)).toBe('3m 05s');
    expect(took(3720)).toBe('1h 02m');
    expect(count(31402)).toBe('31,402');
    expect(size(2.1e9)).toBe('2.1 GB');
    expect(size(480e6)).toBe('480 MB');
  });

  it('shortens long text at a word', () => {
    expect(shorten('short')).toBe('short');
    expect(shorten('one two three four', 10)).toBe('one two…');
  });
});

describe('prompts', () => {
  const skill = { rules: '# Cut rules\n- cut ads', learnings: '' };
  const about = {
    title: 'T',
    channel: 'C',
    description: 'Sponsored by NordVPN: nordvpn.com/c',
    chapters: [{ title: 'Intro', start: 0 }],
  };

  it('gives Claude the rules, the video, numbered sentences and the exact shape', () => {
    const prompt = cutPrompt({
      skill,
      strength: 'normal',
      about,
      sentences: [{ n: 1, start: 4, text: 'Welcome back.' }],
      part: null,
    });
    for (const part of [
      '# Cut rules',
      'strength "normal"',
      'Sponsored by NordVPN',
      '00:00:00 Intro',
      '[1] 00:00:04 Welcome back.',
      '{"cuts":[{"from":12,"to":18,"kind":"ad","reason":"sponsor read for a VPN"}],"learnings":[]}',
      'woven in smoothly',
      'description very often names the sponsors',
      'almost always []',
      'None yet.',
    ])
      expect(prompt).toContain(part);
  });

  it('allows only ads and asks at light, and says which part of a long transcript it is', () => {
    const prompt = cutPrompt({
      skill,
      strength: 'light',
      about,
      sentences: [],
      part: { index: 2, count: 3 },
    });
    expect(prompt).toContain('"ad" or "ask"');
    expect(prompt).toContain('Part 2 of 3');
  });

  it('asks for the summary with sentence numbers', () => {
    const prompt = summaryPrompt({
      skill: { rules: '# Summary rules', learnings: '- keep it short (x, d)' },
      about,
      sentences: [{ n: 1, start: 0, text: 'Hi.' }],
    });
    expect(prompt).toContain('# Summary rules');
    expect(prompt).toContain('- keep it short (x, d)');
    expect(prompt).toContain('"sentence":4');
  });

  it('retries with the error', () => {
    expect(retryPrompt('P', 'sentence 9 does not exist')).toMatch(
      /^P\n\n.*sentence 9 does not exist/s,
    );
  });
});

describe('markdown', () => {
  it('writes a transcript with H:MM:SS times', () => {
    expect(
      transcriptMarkdown('T', 'note', [
        { start: 3725, end: 3727, text: 'Hi.' },
      ]),
    ).toBe('# T\n\nnote\n\n**1:02:05** Hi.\n');
  });

  it('writes the summary: overview, points and chapters', () => {
    const md = summaryMarkdown('T', {
      overview: 'About it.',
      points: [{ text: 'Point.', at: 65, atOriginal: 90 }],
      chapters: [{ title: 'Start', at: 0, atOriginal: 0 }],
    });
    expect(md).toContain('About it.');
    expect(md).toContain('## Key points\n\n- **0:01:05** Point.');
    expect(md).toContain('## Chapters\n\n- **0:00:00** Start');
  });
});
