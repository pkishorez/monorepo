import { describe, expect, it } from 'vitest';
import { walk } from '../logic/index.js';
import { tilde } from '../logic/shared/index.js';

describe('walk', () => {
  it('names no folder without a /', () => {
    expect(walk(['code'], 'foo', '/home/me')).toBeNull();
  });

  it('goes from home with ~/, and from the folder open otherwise', () => {
    expect(walk(['x'], '~/code/fo', null)).toEqual({
      segments: ['code'],
      query: 'fo',
    });
    expect(walk(['code'], 'a/b/', null)).toEqual({
      segments: ['code', 'a', 'b'],
      query: '',
    });
  });

  it('goes up with .., never above home', () => {
    expect(walk(['code'], '../../../x', null)).toEqual({
      segments: [],
      query: 'x',
    });
  });

  it('reads the home folder written out, and nothing outside it', () => {
    expect(walk([], '/home/me/code/k', '/home/me')).toEqual({
      segments: ['code'],
      query: 'k',
    });
    expect(walk([], '/etc/x', '/home/me')).toBeNull();
  });
});

describe('tilde', () => {
  it('writes a path under home from ~', () => {
    expect(tilde('/home/me/code', '/home/me')).toBe('~/code');
    expect(tilde('/home/me', '/home/me')).toBe('~');
    expect(tilde('/srv/x', '/home/me')).toBe('/srv/x');
    expect(tilde('/Users/me/code', null)).toBe('~/code');
  });
});
