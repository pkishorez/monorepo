import type { PackageUpdate } from "../core/index.js";

export type UpdateType = "major" | "minor" | "patch" | "none";

export interface SelectablePackage {
  package: PackageUpdate;
  selected: boolean;
}

export function getLatestVersion(pkg: PackageUpdate): string {
  return (
    pkg.updates.major ?? pkg.updates.minor ?? pkg.updates.patch ?? pkg.currentVersion
  );
}

export function getUpdateType(pkg: PackageUpdate): UpdateType {
  if (pkg.updates.major) return "major";
  if (pkg.updates.minor) return "minor";
  if (pkg.updates.patch) return "patch";
  return "none";
}

export function createSelectablePackage(pkg: PackageUpdate): SelectablePackage | null {
  const filteredInstances = pkg.instances.filter(
    (i) => i.type !== "peerDependency"
  );

  if (filteredInstances.length === 0) {
    return null;
  }

  return {
    package: { ...pkg, instances: filteredInstances },
    selected: true,
  };
}
