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

/** Which packages a check covers. */
export interface CheckOptions {
  /**
   * Package folders relative to the root, `''` for the root. Without it,
   * every package with a monoverse.json.
   */
  readonly packages?: readonly string[];
}

/** A project opened once: its files parsed and resolved on first ask, then kept. */
export interface OpenProject {
  /** Every package folder that has a monoverse.json, relative to the root, sorted. */
  readonly packages: readonly string[];
  /** The package folder holding `path`, a file or a folder relative to the root; `''` for the root. */
  readonly packageOf: (path: string) => string;
  /** Every import `file` makes, in source order; none when it is not a source file or cannot be read. */
  readonly importsOf: (file: string) => readonly Import[];
  /** Checks packages, each as its monoverse.json says. */
  readonly check: (options?: CheckOptions) => readonly PackageReport[];
}

/**
 * Opens `project`. Every file is read and parsed at most once, however
 * often it is asked for, so a tool that draws the imports and checks the
 * packages pays for one parse.
 */
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

/** Checks the packages of `project` once: `openProject(project).check(options)`. */
export const checkProject = (
  project: Project,
  options?: CheckOptions,
): readonly PackageReport[] => openProject(project).check(options);
