import { describe, expect, it } from 'vitest';
import { formatSize, limitOf, readFiles, toBase64 } from '../read.ts';

const MB = 1024 * 1024;

describe('toBase64', () => {
  it('encodes bytes without a data: prefix', () => {
    expect(toBase64(new TextEncoder().encode('hello'))).toBe('aGVsbG8=');
  });

  it('encodes more bytes than one slice holds', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 3).map((_, i) => i % 256);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('limitOf', () => {
  it('allows 5 MB for images an agent sees, 50 MB for anything else', () => {
    expect(limitOf('image/png')).toBe(5 * MB);
    expect(limitOf('image/webp')).toBe(5 * MB);
    expect(limitOf('image/svg+xml')).toBe(50 * MB);
    expect(limitOf('video/mp4')).toBe(50 * MB);
  });
});

describe('formatSize', () => {
  it('reads like a person would say it', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(7.24 * MB)).toBe('7.2 MB');
    expect(formatSize(50 * MB)).toBe('50 MB');
  });
});

describe('readFiles', () => {
  it('reads files and names a missing type as bytes', async () => {
    const { read, refused } = await readFiles([
      new File(['hi'], 'note.txt', { type: 'text/plain' }),
      new File(['?'], 'blob'),
    ]);
    expect(refused).toEqual([]);
    expect(read).toEqual([
      { name: 'note.txt', mime: 'text/plain', data: 'aGk=', size: 2 },
      { name: 'blob', mime: 'application/octet-stream', data: 'Pw==', size: 1 },
    ]);
  });

  it('refuses a file over its limit and keeps the rest', async () => {
    const big = new File([new Uint8Array(5 * MB + 1)], 'shot.png', {
      type: 'image/png',
    });
    const { read, refused } = await readFiles([
      big,
      new File(['ok'], 'ok.md', { type: 'text/markdown' }),
    ]);
    expect(read.map(({ name }) => name)).toEqual(['ok.md']);
    expect(refused).toEqual([
      'shot.png is too large. Images can be up to 5 MB.',
    ]);
  });
});
