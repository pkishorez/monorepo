import {
  type Tree,
  enclosing,
  isIndexFile,
  joinPath,
  parentOf,
  relativeTo,
} from '../tree/index.ts';

/*
 * The contracts rule: a contract folder holds only Effect contexts.
 *
 *   1. Every contract the rule requires is there: with
 *      `services/*\/contract` required, each `services/<name>/` has one.
 *   2. A contract exports, as values, only classes: a `Context.Service`
 *      (or `Context.Reference`), and the errors its Service fails with
 *      (`Data.TaggedError`, `Schema.TaggedError`). Everything else it
 *      exports is a type. It may re-export from its own files.
 *
 * Part 2 reads a file's exports, which only the lint can see; the folder
 * logic both halves share lives here.
 */

/** The contracts rule's settings. */
export interface ContractsRule {
  /** Contract folders, as paths from the folder that owns them: `services/*\/contract`. */
  readonly folders: readonly string[];
  /** Of those, the ones that must exist. A capability whose contract a package owns has none. */
  readonly required?: readonly string[];
}

/** What a contract may extend to export a class as a value. */
export const contractClass =
  /^(Context\.(Service|Reference)|Data\.TaggedError|Schema\.TaggedError(Class)?)\b/;

/** The contract folder holding `file`, if any, inside its package `root`. */
export const contractOf = (
  rule: ContractsRule,
  file: string,
  root: string,
): string | undefined =>
  rule.folders
    .map((pattern) => enclosing(parentOf(file), pattern, root)?.folder)
    .find((folder) => folder !== undefined);

/**
 * The folder holding `file` that lacks a contract the rule requires, if
 * any: `services/store/` without `services/store/contract/`. Only an
 * index file is asked, so the folder is reported on its index files
 * rather than on every file in it.
 */
export const missingContract = (
  tree: Tree,
  rule: ContractsRule,
  file: string,
  root: string,
): string | undefined => {
  if (!isIndexFile(file)) return undefined;
  return (rule.required ?? [])
    .map((pattern) => {
      const parts = pattern.split('/');
      const holder = parts.slice(0, -1).join('/');
      const last = parts.at(-1) ?? '';
      const folder = holder
        ? enclosing(parentOf(file), holder, root)?.folder
        : undefined;
      return folder !== undefined && !tree.isModule(joinPath(folder, last))
        ? folder
        : undefined;
    })
    .find((folder) => folder !== undefined);
};

/** What each broken contract is told. Folders are named from the package `root`. */
export const contractMessages = {
  missing: (folder: string, root: string): string => {
    const name = relativeTo(root, folder);
    return `${name} has no contract/. Put its Context.Service in ${name}/contract/index.ts.`;
  },
  value: (folder: string, root: string, what: string): string =>
    `${relativeTo(root, folder)} exports ${what}. A contract exports only Context.Service and error classes as values, and everything else as types.`,
  reexport: (folder: string, root: string, source: string): string =>
    `${relativeTo(root, folder)} re-exports '${source}' from outside itself. Declare it here, as a type or a Context.Service.`,
};
