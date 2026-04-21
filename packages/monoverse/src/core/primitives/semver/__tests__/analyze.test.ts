import { Effect } from 'effect';
import { describe, it } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import {
  normalizeSemver,
  InvalidSemverRangeError,
  isPinnedVersion,
} from '../index.js';

describe('normalizeSemver', () => {
  itEffect('normalizes caret range', () =>
    Effect.gen(function* () {
      const result = yield* normalizeSemver('^1.2.3');
      expect(result).toBe('1.2.3');
    }),
  );

  itEffect('normalizes tilde range', () =>
    Effect.gen(function* () {
      const result = yield* normalizeSemver('~1.2.3');
      expect(result).toBe('1.2.3');
    }),
  );

  itEffect('normalizes exact version', () =>
    Effect.gen(function* () {
      const result = yield* normalizeSemver('1.2.3');
      expect(result).toBe('1.2.3');
    }),
  );

  itEffect('normalizes gte range', () =>
    Effect.gen(function* () {
      const result = yield* normalizeSemver('>=1.0.0');
      expect(result).toBe('1.0.0');
    }),
  );

  itEffect('normalizes gt range', () =>
    Effect.gen(function* () {
      const result = yield* normalizeSemver('>1.0.0');
      expect(result).toBe('1.0.1');
    }),
  );

  itEffect('normalizes wildcard', () =>
    Effect.gen(function* () {
      const result = yield* normalizeSemver('1.x');
      expect(result).toBe('1.0.0');
    }),
  );

  itEffect('normalizes star wildcard', () =>
    Effect.gen(function* () {
      const result = yield* normalizeSemver('*');
      expect(result).toBe('0.0.0');
    }),
  );

  itEffect('normalizes prerelease version', () =>
    Effect.gen(function* () {
      const result = yield* normalizeSemver('^1.0.0-beta.1');
      expect(result).toBe('1.0.0-beta.1');
    }),
  );

  itEffect('fails for workspace protocol', () =>
    Effect.gen(function* () {
      const error = yield* normalizeSemver('workspace:*').pipe(Effect.flip);
      expect(error).toBeInstanceOf(InvalidSemverRangeError);
      expect(error.raw).toBe('workspace:*');
    }),
  );

  itEffect('fails for file protocol', () =>
    Effect.gen(function* () {
      const error = yield* normalizeSemver('file:../local').pipe(Effect.flip);
      expect(error).toBeInstanceOf(InvalidSemverRangeError);
    }),
  );

  itEffect('fails for git protocol', () =>
    Effect.gen(function* () {
      const error = yield* normalizeSemver(
        'git+https://github.com/user/repo',
      ).pipe(Effect.flip);
      expect(error).toBeInstanceOf(InvalidSemverRangeError);
    }),
  );

  itEffect('fails for invalid range', () =>
    Effect.gen(function* () {
      const error = yield* normalizeSemver('not-a-version').pipe(Effect.flip);
      expect(error).toBeInstanceOf(InvalidSemverRangeError);
    }),
  );
});

describe('isPinnedVersion', () => {
  it('returns true for exact versions', () => {
    expect(isPinnedVersion('1.0.0')).toBe(true);
    expect(isPinnedVersion('0.0.1')).toBe(true);
    expect(isPinnedVersion('10.20.30')).toBe(true);
  });

  it('returns true for prerelease versions', () => {
    expect(isPinnedVersion('1.0.0-beta.1')).toBe(true);
    expect(isPinnedVersion('2.0.0-alpha')).toBe(true);
  });

  it('returns true for versions with build metadata', () => {
    expect(isPinnedVersion('1.0.0+build.123')).toBe(true);
  });

  it('returns false for caret ranges', () => {
    expect(isPinnedVersion('^1.0.0')).toBe(false);
  });

  it('returns false for tilde ranges', () => {
    expect(isPinnedVersion('~1.0.0')).toBe(false);
  });

  it('returns false for comparison ranges', () => {
    expect(isPinnedVersion('>=1.0.0')).toBe(false);
    expect(isPinnedVersion('>1.0.0')).toBe(false);
    expect(isPinnedVersion('<=1.0.0')).toBe(false);
    expect(isPinnedVersion('<1.0.0')).toBe(false);
  });

  it('returns false for wildcards', () => {
    expect(isPinnedVersion('*')).toBe(false);
    expect(isPinnedVersion('1.x')).toBe(false);
    expect(isPinnedVersion('1.0.x')).toBe(false);
  });

  it('returns false for hyphen ranges', () => {
    expect(isPinnedVersion('1.0.0 - 2.0.0')).toBe(false);
  });

  it('returns false for or ranges', () => {
    expect(isPinnedVersion('1.0.0 || 2.0.0')).toBe(false);
  });

  it('trims whitespace', () => {
    expect(isPinnedVersion('  1.0.0  ')).toBe(true);
    expect(isPinnedVersion('  ^1.0.0  ')).toBe(false);
  });
});
