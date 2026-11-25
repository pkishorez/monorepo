import { configFile } from '../shared/config/index.ts';
import { joinPath, listTree, parentOf } from '../shared/tree/index.ts';
import { type PackageReport, checkPackage } from './check.ts';
import { type Import, type Project, sourcesOf } from './source.ts';

export type {
  PackageReport,
  PackageResult,
  Violation,
  ViolationKind,
} from './check.ts';
export {
  type Import,
  type Project,
  isSource,
  sourceExtensions,
} from './source.ts';

export interface CheckOptions {
  readonly packages?: readonly string[];
}

export interface OpenProject {
  readonly packages: readonly string[];
  readonly packageOf: (path: string) => string;
  readonly importsOf: (file: string) => readonly Import[];
  readonly check: (options?: CheckOptions) => readonly PackageReport[];
}

export const openProject = (project: Project): OpenProject => {
  const sources = sourcesOf(project);
  const tree = listTree(project.files);
  const packages = project.files
    .filter((file) => file === configFile || file.endsWith(`/${configFile}`))
    .map(parentOf)
    .filter((dir) => sources.files.has(joinPath(dir, 'package.json')))
    .sort();
  return {
    packages,
    packageOf: (path) => tree.packageOf(path),
    importsOf: (file) => sources.parse(file)?.imports ?? [],
    check: (options = {}) =>
      [...new Set(options.packages ?? packages)].map((pkg) =>
        checkPackage(sources, tree, pkg),
      ),
  };
};

export const checkProject = (
  project: Project,
  options?: CheckOptions,
): readonly PackageReport[] => openProject(project).check(options);
