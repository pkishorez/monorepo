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

export type ViolationKind =
  | 'inside'
  | 'door'
  | 'contract'
  | 'restriction'
  | 'unused-exception'
  | 'stale-restriction';

export interface Violation {
  readonly kind: ViolationKind;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly to?: string;
  readonly specifier?: string;
  readonly message: string;
}

export interface Excepted {
  readonly by: 'door' | 'exception';
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly to: string;
  readonly specifier: string;
  readonly message: string;
}

export type PackageResult =
  | { readonly _tag: 'Unchecked' }
  | {
      readonly _tag: 'Invalid';
      readonly file: string;
      readonly message: string;
    }
  | {
      readonly _tag: 'Checked';
      readonly violations: readonly Violation[];
      readonly excepted: readonly Excepted[];
    };

export interface PackageReport {
  readonly path: string;
  readonly result: PackageResult;
}

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
      ...findingsOf(sources, tree, pkg, read.config, file, text),
    },
  };
};

const findingsOf = (
  sources: Sources,
  tree: Tree,
  pkg: string,
  config: Config,
  configPath: string,
  configText: string,
): {
  readonly violations: readonly Violation[];
  readonly excepted: readonly Excepted[];
} => {
  const { imports: importsRule, contracts } = config.rules;
  const lifting = new Set<Pass>();
  const covering = new Set<Pass>();
  const found: Violation[] = [];
  const excepted: Excepted[] = [];

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
        const to = relativeTo(pkg, own);
        const exception = verdict.ok
          ? undefined
          : config.exceptions.find(
              (e) => matches(from, e.from) && matches(to, e.to),
            );
        if (exception) lifting.add(exception);
        if (verdict.ok && verdict.door !== undefined)
          excepted.push({
            ...at,
            by: 'door',
            to: own,
            message: `'${specifier}' is beside or above this file, and comes in through the door ${relativeTo(pkg, verdict.door)}.`,
          });
        else if (exception)
          excepted.push({
            ...at,
            by: 'exception',
            to: own,
            message: `'${specifier}' breaks the rules, and the exception from '${exception.from}' to '${exception.to}' lets it through: ${exception.reason}`,
          });
        else if (!verdict.ok)
          found.push({
            ...at,
            kind: verdict.reason,
            to: own,
            message: importMessage(verdict, specifier, pkg),
          });
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

  return { violations: found.sort(byPlace), excepted: excepted.sort(byPlace) };
};

const byPlace = (
  a: { readonly file: string; readonly line: number; readonly column: number },
  b: { readonly file: string; readonly line: number; readonly column: number },
) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column;

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
