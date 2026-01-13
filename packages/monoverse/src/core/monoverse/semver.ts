import * as semver from "semver";
import type { SemverUpdates } from "./types.js";

export function extractVersion(versionRange: string): string | null {
  const cleaned = versionRange.replace(/[\^~>=<\s]/g, "");
  return semver.valid(semver.coerce(cleaned));
}

export function calculateSemverUpdates(
  currentVersion: string,
  allVersions: string[]
): SemverUpdates {
  const current = semver.parse(currentVersion);
  if (!current) {
    return { patch: null, minor: null, major: null };
  }

  const validVersions = allVersions
    .map((v) => semver.parse(v))
    .filter((v): v is semver.SemVer => v !== null && !v.prerelease.length)
    .filter((v) => semver.gt(v, current))
    .sort(semver.compare);

  let patch: string | null = null;
  let minor: string | null = null;
  let major: string | null = null;

  for (const v of validVersions) {
    if (v.major === current.major && v.minor === current.minor) {
      patch = v.version;
    } else if (v.major === current.major && v.minor > current.minor) {
      minor = v.version;
    } else if (v.major > current.major) {
      major = v.version;
    }
  }

  return { patch, minor, major };
}
