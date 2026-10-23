import { describe, expect, it } from 'vitest';
import { CHUNK_MAX_CHARS, makeChunker } from './chunker.js';

const sentence = (n: number) =>
  `Sentence ${n} has some words in it to fill space. `;

describe('Chunker', () => {
  it('holds text until enough has built up', () => {
    const chunker = makeChunker();
    expect(chunker.push('A short start. ')).toEqual([]);
    expect(chunker.pending()).toBe(true);
  });

  it('cuts at the last sentence end once enough has built up', () => {
    const chunker = makeChunker();
    const text =
      Array.from({ length: 6 }, (_, n) => sentence(n)).join('') + 'And a half';
    const chunks = chunker.push(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.endsWith('fill space.')).toBe(true);
    expect(chunker.flush()).toBe(' And a half');
  });

  it('cuts a long run with no sentence end at the hard limit', () => {
    const chunker = makeChunker();
    const chunks = chunker.push('x'.repeat(CHUNK_MAX_CHARS + 10));
    expect(chunks).toEqual(['x'.repeat(CHUNK_MAX_CHARS + 10)]);
  });

  it('loses nothing across many small deltas', () => {
    const chunker = makeChunker();
    const text = Array.from({ length: 40 }, (_, n) => sentence(n)).join('');
    const out = [...text].flatMap((char) => chunker.push(char));
    const rest = chunker.flush();
    expect(out.join('') + (rest ?? '')).toBe(text);
    expect(out.length).toBeGreaterThan(3);
  });
});
