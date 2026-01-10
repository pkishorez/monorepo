import type { DependencyType } from '../analyze/types.js';

export interface DependencyInstance {
  workspace: string;
  versionRange: string;
  type: DependencyType;
}

export interface PackageGroup {
  name: string;
  instances: DependencyInstance[];
}
