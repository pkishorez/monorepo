import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { describe, expect, it } from 'vitest';
import {
  findStrategyRule,
  isNeverCached,
  matchStrategyRule,
  StrategyRule,
} from '../index.js';

const decode = Schema.decodeUnknownSync(StrategyRule);
const self = 'https://app.test';
const get = (url: string, destination = '') => ({
  url,
  method: 'GET',
  destination,
});

describe('StrategyRule', () => {
  it('defaults origin to same-origin', () => {
    const rule = decode({ match: {}, strategy: 'cache-first', cacheName: 'x' });
    expect(rule.match.origin).toBe('same-origin');
  });

  it('rejects bad cache names and regex sources', () => {
    expect(() =>
      decode({ match: {}, strategy: 'cache-first', cacheName: 'Bad Name' }),
    ).toThrow();
    expect(() =>
      decode({
        match: { pattern: '(' },
        strategy: 'cache-first',
        cacheName: 'x',
      }),
    ).toThrow();
    expect(() =>
      decode({ match: {}, strategy: 'cache-last', cacheName: 'x' }),
    ).toThrow();
  });
});

describe('matchStrategyRule', () => {
  const images = decode({
    match: { destination: ['image'], pathPrefix: '/media/' },
    strategy: 'cache-first',
    cacheName: 'images',
  });
  const fonts = decode({
    match: { origin: 'https://fonts.gstatic.com', pattern: '\\.woff2$' },
    strategy: 'cache-first',
    cacheName: 'fonts',
  });

  it('requires every present condition', () => {
    expect(
      matchStrategyRule(images, get(`${self}/media/a.png`, 'image'), self),
    ).toBe(true);
    expect(
      matchStrategyRule(images, get(`${self}/other/a.png`, 'image'), self),
    ).toBe(false);
    expect(
      matchStrategyRule(images, get(`${self}/media/a.png`, 'script'), self),
    ).toBe(false);
    expect(
      matchStrategyRule(
        images,
        get('https://cdn.test/media/a.png', 'image'),
        self,
      ),
    ).toBe(false);
  });

  it('matches explicit origins and patterns', () => {
    expect(
      matchStrategyRule(
        fonts,
        get('https://fonts.gstatic.com/s/a.woff2'),
        self,
      ),
    ).toBe(true);
    expect(
      matchStrategyRule(fonts, get('https://fonts.gstatic.com/s/a.css'), self),
    ).toBe(false);
  });

  it('only matches GET', () => {
    const post = { ...get(`${self}/media/a.png`, 'image'), method: 'POST' };
    expect(matchStrategyRule(images, post, self)).toBe(false);
  });

  it('finds the first matching rule', () => {
    const all = decode({
      match: {},
      strategy: 'network-first',
      cacheName: 'all',
    });
    const found = findStrategyRule(
      [images, all],
      get(`${self}/media/a.png`, 'image'),
      self,
    );
    expect(Option.getOrThrow(found).cacheName).toBe('images');
    expect(
      Option.isNone(findStrategyRule([fonts], get(`${self}/x`), self)),
    ).toBe(true);
  });
});

describe('isNeverCached', () => {
  it('matches same-origin path prefixes only', () => {
    expect(
      isNeverCached(['/api/auth/'], get(`${self}/api/auth/session`), self),
    ).toBe(true);
    expect(isNeverCached(['/api/auth/'], get(`${self}/api/todos`), self)).toBe(
      false,
    );
    expect(
      isNeverCached(['/api/auth/'], get('https://other.test/api/auth/x'), self),
    ).toBe(false);
  });
});
