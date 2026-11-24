import {
  type Config,
  type Pass,
  configFile,
  isChecked,
  matches,
  parseConfig,
} from '../shared/config/index.ts';
import { contractFindings } from '../shared/contracts/index.ts';
import { importMessage, judgeImport } from '../shared/imports/index.ts';
import {
  type Tree,
  joinPath,
  parentOf,
  relativeTo,
} from '../shared/tree/index.ts';
import { type Sources, isSource } from './source.ts';

/*
 * One package checked as its monoverse.json says: every file it checks,
 * each import judged by the imports rule unless an exception lifts it,
 * then by the restrictions, which nothing lifts, and each contract read.
 * What is wrong with the monoverse.json itself (an exception that lifts
 * nothing, a restriction that covers no file) is told once, on it.
 */

/** What a Violation breaks. */
export type ViolationKind =
  /** An import reaches inside a module. */
  | 'inside'
  /** An import reaches beside or above, not through a door. */
  | 'door'
  /** A contract is missing, or exports what it may not. */
  | 'contract'
  /** An import a restriction refuses. */
  | 'restriction'
  /** An exception that lifts no import: told on the monoverse.json. */
  | 'unused-exception'
  /** A restriction whose `from` matches no checked file: told on the monoverse.json. */
  | 'stale-restriction';

/** One thing that breaks a package's monoverse.json. */
export interface Violation {
  readonly kind: ViolationKind;
  /** The file it is told on, relative to the root. */
  readonly file: string;
  /** Where, both 1-based. */
  readonly line: number;
  readonly column: number;
  /** The file the import names, relative to the root, when it names one. */
  readonly to?: string;
  /** The import as written. */
  readonly specifier?: string;
  readonly message: string;
}

/** What a package's check found. */
export type PackageResult =
  /** No monoverse.json: nothing is checked. */
  | { readonly _tag: 'Unchecked' }
  /** A monoverse.json that cannot be read, and why. Nothing else is checked. */
  | {
      readonly _tag: 'Invalid';
      readonly file: string;
      readonly message: string;
    }
  | { readonly _tag: 'Checked'; readonly violations: readonly Violation[] };

/** One package's check. */
export interface PackageReport {
  /** The package folder, relative to the root; `''` is the root. */
  readonly path: string;
  readonly result: PackageResult;
}

/** Checks the package at `pkg`, a folder holding a `package.json`. */
export const checkPackage = (
  sources: Sources,
  tree: Tree,
  pkg: string,
): PackageReport => {
  const file = joinPath(pkg, configFile);
  const text = sources.files.has(file) ? sources.read(file) : undefined;
  if (text === undefined) return { path: pkg, result: { _tag: 'Unchecked' } };
  const read = parseConfig(text);
  if (!read.ok)
    return {
      path: pkg,
      result: { _tag: 'Invalid', file, message: read.error },
    };
  return {
    path: pkg,
    result: {
      _tag: 'Checked',
      violations: violationsOf(sources, tree, pkg, read.config, file, text),
    },
  };
};

const violationsOf = (
  sources: Sources,
  tree: Tree,
  pkg: string,
  config: Config,
  configPath: string,
  configText: string,
): readonly Violation[] => {
  const { imports: importsRule, contracts } = config.rules;
  const lifting = new Set<Pass>();
  const covering = new Set<Pass>();
  const found: Violation[] = [];

  for (const file of sources.files) {
    if (!isSource(file) || tree.packageOf(parentOf(file)) !== pkg) continue;
    const from = relativeTo(pkg, file);
    if (!isChecked(config, from)) continue;
    const restrictions = config.restrictions.filter((r) =>
      matches(from, r.from),
    );
    for (const restriction of restrictions) covering.add(restriction);
    const parsed = sources.parse(file);
    if (!parsed) continue;

    for (const { specifier, target, line, column } of parsed.imports) {
      const at = { file, line, column, specifier };
      const own =
        target !== undefined && tree.packageOf(parentOf(target)) === pkg
          ? target
          : undefined;

      if (importsRule && own !== undefined && isSource(own)) {
        const verdict = judgeImport(tree, importsRule, file, own);
        if (!verdict.ok) {
          const to = relativeTo(pkg, own);
          const exception = config.exceptions.find(
            (e) => matches(from, e.from) && matches(to, e.to),
          );
          if (exception) lifting.add(exception);
          else
            found.push({
              ...at,
              kind: verdict.reason,
              to: own,
              message: importMessage(verdict, specifier, pkg),
            });
        }
      }

      const subject = own === undefined ? specifier : relativeTo(pkg, own);
      for (const restriction of restrictions)
        if (matches(subject, restriction.to))
          found.push({
            ...at,
            kind: 'restriction',
            ...(target === undefined ? {} : { to: target }),
            message: `'${specifier}' may not be imported here: ${restriction.reason}`,
          });
    }

    if (contracts) {
      const targets = new Map(
        parsed.imports.map((i) => [i.specifier, i.target] as const),
      );
      for (const { at, message } of contractFindings(
        tree,
        contracts,
        file,
        pkg,
        parsed.exports,
        (specifier) => targets.get(specifier),
      ))
        found.push({ kind: 'contract', file, ...parsed.at(at), message });
    }
  }

  const told = (key: 'exceptions' | 'restrictions', index: number) => ({
    file: configPath,
    ...entryAt(configText, key, index),
  });
  config.exceptions.forEach((exception, i) => {
    if (!lifting.has(exception))
      found.push({
        kind: 'unused-exception',
        ...told('exceptions', i),
        message: `The exception from '${exception.from}' to '${exception.to}' lets no import through. Remove it, or fix its globs.`,
      });
  });
  config.restrictions.forEach((restriction, i) => {
    if (!covering.has(restriction))
      found.push({
        kind: 'stale-restriction',
        ...told('restrictions', i),
        message: `The restriction from '${restriction.from}' covers no file this package checks. Remove it, or fix its "from".`,
      });
  });

  return found.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
  );
};

/**
 * Where the `index`th entry of the top-level list under `key` starts in
 * a monoverse.json. Strings are skipped whole, so a `{` in a glob or a
 * value that reads like the key never counts.
 */
const entryAt = (
  text: string,
  key: string,
  index: number,
): { readonly line: number; readonly column: number } => {
  let depth = 0;
  let last: string | undefined;
  let found = false;
  let list = -1;
  let seen = -1;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      let end = i + 1;
      while (end < text.length && text[end] !== '"')
        end += text[end] === '\\' ? 2 : 1;
      last = text.slice(i + 1, end);
      i = end;
    } else if (char === ':') {
      found = depth === 1 && last === key;
    } else if (char === '[' || char === '{') {
      if (char === '{' && list === depth && ++seen === index) {
        const before = text.slice(0, i).split('\n');
        return {
          line: before.length,
          column: (before.at(-1)?.length ?? 0) + 1,
        };
      }
      depth += 1;
      if (char === '[' && found) list = depth;
      found = false;
    } else if (char === ']' || char === '}') {
      if (depth === list) list = -1;
      depth -= 1;
    } else if (char === ',') {
      last = undefined;
      found = false;
    }
  }
  return { line: 1, column: 1 };
};
