import type { DependencyType, Workspace } from "../pipeline/analyze/index.js";
import type { PackageGroup } from "../pipeline/validate/types.js";

export interface AddPackageOptions {
  packageName: string;
  versionRange: string;
  dependencyType: DependencyType;
  workspace: Workspace;
}

export interface RemovePackageOptions {
  packageName: string;
  workspace: Workspace;
}

export interface SemverUpdates {
  patch: string | null;
  minor: string | null;
  major: string | null;
}

export interface PackageUpdate {
  name: string;
  currentVersion: string;
  updates: SemverUpdates;
  instances: PackageGroup["instances"];
}

export interface LoadProgress {
  total: number;
  loaded: number;
  currentPackage: string;
}
