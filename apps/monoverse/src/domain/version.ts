import { gt, maxSatisfying, minSatisfying } from "semver";

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
