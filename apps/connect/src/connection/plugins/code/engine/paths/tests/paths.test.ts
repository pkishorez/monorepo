import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  absolute,
  basename,
  dirname,
  isWithin,
  join,
  relative,
} from '../index.js';

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

  it('names the folder a path is in as Node does', () => {
    for (const path of ['/a/b', '/a/b/', '/', '/a'])
      expect(dirname(path)).toBe(posix.dirname(path.replace(/(.)\/$/, '$1')));
  });

  it('tells a path below a folder from one beside it', () => {
    expect(isWithin('/home/ada', '/home/ada')).toBe(true);
    expect(isWithin('/home/ada', '/home/ada/code')).toBe(true);
    expect(isWithin('/home/ada', '/home/ada2')).toBe(false);
    expect(isWithin('/home/ada', '/home/ada/..foo')).toBe(true);
    expect(isWithin('/home/ada', '/home')).toBe(false);
    expect(isWithin('/', '/srv')).toBe(true);
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
