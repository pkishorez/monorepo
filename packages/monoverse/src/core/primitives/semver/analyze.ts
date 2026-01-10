import { Effect } from 'effect';
import * as semver from 'semver';
import { InvalidSemverRangeError } from './types.js';

export const normalizeSemver = (
  raw: string,
): Effect.Effect<string, InvalidSemverRangeError> =>
  Effect.try({
    try: () => {
      const minVer = semver.minVersion(raw);
      if (!minVer) throw new Error('Invalid range');
      return minVer.version;
    },
    catch: () => new InvalidSemverRangeError({ raw }),
  });

export const isPinnedVersion = (versionRange: string): boolean =>
  semver.valid(versionRange.trim()) !== null;
