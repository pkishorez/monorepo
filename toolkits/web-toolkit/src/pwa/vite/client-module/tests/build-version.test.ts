import { describe, expect, it } from 'vitest';
import { resolvePwaConfig } from '../../../shared/config/index.js';
import { resolveBuildVersion } from '../build-version.js';

const now = new Date('2026-09-27T10:00:00.000Z');

describe('resolveBuildVersion', () => {
  it('reads the commit from git and stamps the build time', () => {
    const version = resolveBuildVersion(
      resolvePwaConfig({}),
      process.cwd(),
      now,
    );
    expect(version.builtAt).toBe('2026-09-27T10:00:00.000Z');
    expect(version.commit).toMatch(/^[0-9a-f]{4,}(-dirty)?$/);
  });

  it('has no commit outside a git checkout', () => {
    expect(
      resolveBuildVersion(resolvePwaConfig({}), '/', now).commit,
    ).toBeNull();
  });

  it('prefers the version options', () => {
    const config = resolvePwaConfig({
      version: { commit: 'release-7', builtAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(resolveBuildVersion(config, process.cwd(), now)).toEqual({
      commit: 'release-7',
      builtAt: '2026-01-01T00:00:00.000Z',
    });
  });
});
