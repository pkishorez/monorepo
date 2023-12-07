import { clean, gt, maxSatisfying, minSatisfying } from "semver";
import invariant from "tiny-invariant";

export const getMaxVersionFromRange = (
  versionRange: string,
  versions: string[],
) => {
  return maxSatisfying(versions, versionRange, {}) ?? "NA";
};

export const getMinVersionFromRange = (
  versionRange: string,
  versions: string[],
) => {
  return minSatisfying(versions, versionRange, {});
};

export const getMaxVersion = (versions: string[]) => {
  return versions.sort((a, b) => (gt(a, b) ? -1 : 1))[0];
};

export const bumpVersionRange = (versionRange: string, version: string) => {
  version = clean(version)!;
  invariant(
    typeof version === "string",
    `${version} should be a valid version`,
  );

  const bump = versionRange[0];

  if (bump === "~") {
    // Patch only updates.
    return `~${version}`;
  }
  if (bump === "^") {
    return `^${version}`;
  }

  return versionRange;
};
