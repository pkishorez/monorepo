import type { Declaration, Expression, Program } from 'oxc-parser';
import {
  type Tree,
  enclosing,
  isIndexFile,
  isInside,
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
 */

/** The contracts rule's settings. */
export interface ContractsRule {
  /** Contract folders, as paths from the folder that owns them: `services/*\/contract`. */
  readonly folders: readonly string[];
  /** Of those, the ones that must exist. A capability whose contract a package owns has none. */
  readonly required?: readonly string[];
}

/** One thing wrong with a file under the contracts rule, at an offset in its text. */
export interface ContractFinding {
  readonly at: number;
  readonly message: string;
}

/** What a contract may extend to export a class as a value. */
const contractClass =
  /^(Context\.(Service|Reference)|Data\.TaggedError|Schema\.TaggedError(Class)?)\b/;

/**
 * What a file exports that the contracts rule asks about: each value it
 * exports other than a contract class, and each module it re-exports
 * values from. Read once from the parse, so the parse need not be kept.
 */
export type Export =
  | { readonly kind: 'value'; readonly at: number; readonly what: string }
  | {
      readonly kind: 'reexport';
      readonly at: number;
      readonly specifier: string;
    };

/** The Exports of a parsed file, in source order. */
export const exportsOf = (program: Program): readonly Export[] => {
  const found: Export[] = [];
  const value = (at: number, what: string) =>
    found.push({ kind: 'value', at, what });
  const reexport = (source: { start: number; value: string }) =>
    found.push({ kind: 'reexport', at: source.start, specifier: source.value });

  for (const statement of program.body) {
    switch (statement.type) {
      case 'ExportNamedDeclaration': {
        if (statement.exportKind === 'type') break;
        const { source, specifiers, declaration } = statement;
        if (source) {
          if (specifiers.some((s) => s.exportKind !== 'type')) reexport(source);
          break;
        }
        if (!declaration) {
          for (const specifier of specifiers)
            if (specifier.exportKind !== 'type')
              value(
                specifier.start,
                'a value by name; export the class where it is declared',
              );
          break;
        }
        exported(declaration, value);
        break;
      }
      case 'ExportAllDeclaration':
        if (statement.exportKind !== 'type') reexport(statement.source);
        break;
      case 'ExportDefaultDeclaration':
        value(statement.start, 'a default export');
        break;
      case 'TSExportAssignment':
        value(statement.start, 'an export assignment');
        break;
    }
  }
  return found;
};

/**
 * What the contracts rule finds in `file`, a file the package at `root`
 * checks, which exports `exports`. `resolve` names the file a specifier
 * points at, so a re-export from the contract's own files passes.
 */
export const contractFindings = (
  tree: Tree,
  rule: ContractsRule,
  file: string,
  root: string,
  exports: readonly Export[],
  resolve: (specifier: string) => string | undefined,
): readonly ContractFinding[] => {
  const findings: ContractFinding[] = [];
  const missing = missingContract(tree, rule, file, root);
  if (missing !== undefined) {
    const name = relativeTo(root, missing);
    findings.push({
      at: 0,
      message: `${name} has no contract/. Put its Context.Service in ${name}/contract/index.ts.`,
    });
  }
  const contract = rule.folders
    .map((pattern) => enclosing(parentOf(file), pattern, root)?.folder)
    .find((folder) => folder !== undefined);
  if (contract === undefined) return findings;
  const name = relativeTo(root, contract);

  for (const entry of exports) {
    if (entry.kind === 'value') {
      findings.push({
        at: entry.at,
        message: `${name} exports ${entry.what}. A contract exports only Context.Service and error classes as values, and everything else as types.`,
      });
      continue;
    }
    const target = resolve(entry.specifier);
    if (target !== undefined && isInside(target, contract)) continue;
    findings.push({
      at: entry.at,
      message: `${name} re-exports '${entry.specifier}' from outside itself. Declare it here, as a type or a Context.Service.`,
    });
  }
  return findings;
};

/**
 * The folder holding `file` that lacks a contract the rule requires, if
 * any: `services/store/` without `services/store/contract/`. Only an
 * index file is asked, so the folder is reported on its index files
 * rather than on every file in it.
 */
const missingContract = (
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

/** Tells `value` when an exported declaration is a value other than a contract class. */
const exported = (
  declaration: Declaration,
  value: (at: number, what: string) => void,
): void => {
  switch (declaration.type) {
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
      return;
    case 'ClassDeclaration':
    case 'ClassExpression': {
      const parent = declaration.superClass;
      if (parent && contractClass.test(calleeName(parent))) return;
      value(
        declaration.start,
        `the class ${declaration.id?.name ?? ''}, which is neither a Context.Service nor an error`,
      );
      return;
    }
    default:
      value(declaration.start, `a ${describe[declaration.type] ?? 'value'}`);
  }
};

/**
 * The dotted name a class extends, through the calls and type arguments
 * around it: `Context.Service<A, B>()('Key')` is `Context.Service`.
 */
const calleeName = (node: Expression): string => {
  switch (node.type) {
    case 'CallExpression':
      return calleeName(node.callee);
    case 'TSInstantiationExpression':
      return calleeName(node.expression);
    case 'MemberExpression':
      return node.property.type === 'Identifier'
        ? `${calleeName(node.object)}.${node.property.name}`
        : '';
    case 'Identifier':
      return node.name;
    default:
      return '';
  }
};

const describe: Readonly<Record<string, string>> = {
  VariableDeclaration: 'variable',
  FunctionDeclaration: 'function',
  TSEnumDeclaration: 'enum',
  TSModuleDeclaration: 'namespace',
};
