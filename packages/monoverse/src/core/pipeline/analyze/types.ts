import { Data } from 'effect';

export type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'bun' | 'unknown';

export type DependencyType =
  | 'dependency'
  | 'devDependency'
  | 'peerDependency'
  | 'optionalDependency';

export type DependencySource = 'npm' | 'workspace' | 'file' | 'git' | 'url';

export interface Dependency {
  name: string;
  versionRange: string;
  dependencyType: DependencyType;
  source: DependencySource;
}

export interface Workspace {
  name: string;
  version: string;
  path: string;
  private: boolean;
  dependencies: Dependency[];
}

export interface AnalysisError {
  path: string;
  message: string;
  cause?: unknown;
}

export interface MonorepoAnalysis {
  root: string;
  packageManager: PackageManager;
  workspaces: Workspace[];
  errors: AnalysisError[];
}

export class NotAMonorepoError extends Data.TaggedError('NotAMonorepoError')<{
  startPath: string;
  message: string;
}> {}
