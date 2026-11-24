import {
  type EsNode,
  fieldOf,
  nodeOf,
  nodesOf,
  stringOf,
} from '../estree/index.ts';
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
 *
 * Both read one parsed file, so the lint and the DevTools find the same.
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

/** One thing wrong with a file under the contracts rule, at the node to mark. */
export interface ContractFinding {
  readonly node: EsNode;
  readonly message: string;
}

/**
 * What the contracts rule finds in `file`, a file the package checks,
 * parsed as `program`. `resolve` names the file a specifier points at,
 * so a re-export from the contract's own files passes.
 */
export const contractFindings = (
  tree: Tree,
  rule: ContractsRule,
  file: string,
  root: string,
  program: EsNode,
  resolve: (specifier: string) => string | undefined,
): readonly ContractFinding[] => {
  const findings: ContractFinding[] = [];
  const missing = missingContract(tree, rule, file, root);
  if (missing)
    findings.push({
      node: program,
      message: contractMessages.missing(missing, root),
    });
  const contract = contractOf(rule, file, root);
  if (!contract) return findings;

  const value = (node: EsNode, what: string) =>
    findings.push({
      node,
      message: contractMessages.value(contract, root, what),
    });
  const reexport = (source: EsNode | undefined) => {
    const specifier = stringOf(source);
    if (!source || specifier === undefined) return;
    const target = resolve(specifier);
    if (target && isInside(target, contract)) return;
    findings.push({
      node: source,
      message: contractMessages.reexport(contract, root, specifier),
    });
  };

  for (const statement of nodesOf(program, 'body')) {
    const isType = fieldOf(statement, 'exportKind') === 'type';
    switch (statement.type) {
      case 'ExportNamedDeclaration': {
        if (isType) break;
        const specifiers = nodesOf(statement, 'specifiers');
        const source = nodeOf(statement, 'source');
        if (source) {
          if (specifiers.some((s) => fieldOf(s, 'exportKind') !== 'type'))
            reexport(source);
          break;
        }
        const declaration = nodeOf(statement, 'declaration');
        if (!declaration) {
          for (const specifier of specifiers)
            if (fieldOf(specifier, 'exportKind') !== 'type')
              value(
                specifier,
                'a value by name; export the class where it is declared',
              );
          break;
        }
        exported(declaration, value);
        break;
      }
      case 'ExportAllDeclaration':
        if (!isType) reexport(nodeOf(statement, 'source'));
        break;
      case 'ExportDefaultDeclaration':
        value(statement, 'a default export');
        break;
      case 'TSExportAssignment':
        value(statement, 'an export assignment');
        break;
    }
  }
  return findings;
};

/** Tells `value` when an exported declaration is a value other than a contract class. */
const exported = (
  declaration: EsNode,
  value: (node: EsNode, what: string) => void,
): void => {
  switch (declaration.type) {
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
      return;
    case 'ClassDeclaration': {
      const parent = nodeOf(declaration, 'superClass');
      if (parent && contractClass.test(calleeName(parent))) return;
      const id = nodeOf(declaration, 'id');
      const name = id ? fieldOf(id, 'name') : undefined;
      value(
        declaration,
        `the class ${typeof name === 'string' ? name : ''}, which is neither a Context.Service nor an error`,
      );
      return;
    }
    default:
      value(declaration, `a ${describe(declaration.type)}`);
  }
};

/**
 * The dotted name a class extends, through the calls and type arguments
 * around it: `Context.Service<A, B>()('Key')` is `Context.Service`.
 */
const calleeName = (node: EsNode): string => {
  switch (node.type) {
    case 'CallExpression': {
      const callee = nodeOf(node, 'callee');
      return callee ? calleeName(callee) : '';
    }
    case 'TSInstantiationExpression': {
      const inner = nodeOf(node, 'expression');
      return inner ? calleeName(inner) : '';
    }
    case 'MemberExpression': {
      const object = nodeOf(node, 'object');
      const property = nodeOf(node, 'property');
      const name = property ? fieldOf(property, 'name') : undefined;
      return object && typeof name === 'string'
        ? `${calleeName(object)}.${name}`
        : '';
    }
    case 'Identifier': {
      const name = fieldOf(node, 'name');
      return typeof name === 'string' ? name : '';
    }
    default:
      return '';
  }
};

const describe = (type: string): string =>
  ({
    VariableDeclaration: 'variable',
    FunctionDeclaration: 'function',
    TSEnumDeclaration: 'enum',
    TSModuleDeclaration: 'namespace',
  })[type] ?? 'value';
