import type { Dependency, DependencySource, DependencyType } from './types.js';

export const parseDependencySource = (
  versionRange: string,
): DependencySource => {
  if (
    versionRange.startsWith('file:') ||
    versionRange.startsWith('./') ||
    versionRange.startsWith('../') ||
    versionRange.startsWith('/')
  ) {
    return 'file';
  }
  if (
    versionRange.startsWith('git+') ||
    versionRange.startsWith('git://') ||
    versionRange.startsWith('github:') ||
    versionRange.startsWith('gitlab:') ||
    versionRange.startsWith('bitbucket:')
  ) {
    return 'git';
  }
  if (
    versionRange.startsWith('http://') ||
    versionRange.startsWith('https://')
  ) {
    return 'url';
  }
  return 'npm';
};

export const parseDependencies = (
  deps: Record<string, string> | undefined,
  dependencyType: DependencyType,
  workspaceNames: Set<string>,
): Dependency[] => {
  if (!deps) return [];
  return Object.entries(deps).map(([name, versionRange]) => ({
    name,
    versionRange,
    dependencyType,
    source: workspaceNames.has(name)
      ? 'workspace'
      : parseDependencySource(versionRange),
  }));
};
