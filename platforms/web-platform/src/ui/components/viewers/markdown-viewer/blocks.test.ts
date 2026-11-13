import { describe, expect, it } from 'vitest';
import { blocksOf } from './blocks';

/*
 * Markdown cut into top-level blocks only where one surely starts, so the
 * blocks joined again are the text, and each reads as it did in the whole.
 */

const cut = (text: string) => {
  const blocks = blocksOf(text);
  expect(blocks.join('\n')).toBe(text);
  return blocks;
};

describe('blocksOf', () => {
  it('cuts at a blank line before a paragraph, a heading or a fence', () => {
    expect(
      cut(
        '# Title\n\nOne line.\nStill one.\n\n```ts\nconst a = 1;\n```\n\nEnd.',
      ),
    ).toEqual([
      '# Title\n',
      'One line.\nStill one.\n',
      '```ts\nconst a = 1;\n```\n',
      'End.',
    ]);
  });

  it('never cuts inside a fenced code block, blank lines and all', () => {
    expect(cut('```\na\n\nb\n\n```\n\nafter')).toEqual([
      '```\na\n\nb\n\n```\n',
      'after',
    ]);
    // Still open while it streams: all of it is one block.
    expect(cut('Before.\n\n~~~py\nx = 1\n\ny = 2')).toEqual([
      'Before.\n',
      '~~~py\nx = 1\n\ny = 2',
    ]);
  });

  it('keeps a list whole, its items apart or not, and what is indented under them', () => {
    expect(
      cut('Steps:\n\n1. one\n\n2. two\n\n   more of two\n- three\n\nDone.'),
    ).toEqual([
      'Steps:\n\n1. one\n\n2. two\n\n   more of two\n- three\n',
      'Done.',
    ]);
  });

  it('keeps a table whole', () => {
    expect(cut('| a | b |\n| - | - |\n\n| 1 | 2 |')).toEqual([
      '| a | b |\n| - | - |\n\n| 1 | 2 |',
    ]);
  });

  it('does not cut text whose link references or footnotes reach across blocks', () => {
    expect(
      cut('See [the docs][d].\n\nMore.\n\n[d]: https://x.dev'),
    ).toHaveLength(1);
    expect(cut('A note.[^1]\n\nMore.\n\n[^1]: The note.')).toHaveLength(1);
    expect(cut('<!-- note\n\n# Hidden\n-->\n\nShown.')).toHaveLength(1);
  });

  it('is one block for text with no blank line', () => {
    expect(cut('Just words, arriving')).toEqual(['Just words, arriving']);
    expect(cut('')).toEqual(['']);
  });
});
