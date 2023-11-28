import { maxSatisfying, minSatisfying } from "semver";

export const getMaxVersionFromRange = (
  versionRange: string,
  versions: string[],
) => {
  return maxSatisfying(versions, versionRange, {});
};

export const getMinVersionFromRange = (
  versionRange: string,
  versions: string[],
) => {
  return minSatisfying(versions, versionRange, {});
};
