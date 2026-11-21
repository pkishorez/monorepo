import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { absolute, basename, join, relative } from '../index.js';

/* The engine's own path operations agree with Node's POSIX ones. */

describe('paths', () => {
  it('joins as Node does', () => {
    for (const [first, ...rest] of [
      ['/a', 'b'],
      ['/a/', '/b/c/'],
      ['/a', ''],
      ['/a/b', '../c'],
      ['/a', './b', 'c'],
    ] as const)
      // Node keeps a trailing slash; the engine's paths never end in one.
      expect(join(first, ...rest)).toBe(
        posix.join(first, ...rest).replace(/(.)\/$/, '$1'),
      );
  });

  it('names the last part as Node does', () => {
    for (const path of ['/a/b', '/a/b/', '/', '/a'])
      expect(basename(path)).toBe(posix.basename(path));
  });

  it('finds the path between two as Node does', () => {
    for (const [from, to] of [
      ['/a/b', '/a/b/c/d'],
      ['/a/b', '/a/b'],
      ['/a/b/c', '/a/d'],
      ['/', '/x/y'],
    ] as const)
      expect(relative(from, to)).toBe(posix.relative(from, to));
  });

  it('makes a path the user gave absolute, under home', () => {
    expect(absolute('/home/ada', '~')).toBe('/home/ada');
    expect(absolute('/home/ada', '~/code/')).toBe('/home/ada/code');
    expect(absolute('/home/ada', '/srv//repo/.')).toBe('/srv/repo');
    expect(absolute('/home/ada', 'code')).toBe('/home/ada/code');
  });
});
