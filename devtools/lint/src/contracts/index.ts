import { dirname, join, relative } from 'node:path';
import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import {
  enclosing,
  isIndexFile,
  isInside,
  isModule,
  packageOf,
  resolveImport,
} from '../tree/index.ts';
import { stringsAt } from '../options/index.ts';

/*
 * `kestack/contracts`: a contract folder holds only Effect contexts.
 *
 *   1. Every contract the options require is there: with
 *      `services/*\/contract` required, each `services/<name>/` has one.
 *   2. A contract exports, as values, only classes: a `Context.Service`
 *      (or `Context.Reference`), and the errors its Service fails with
 *      (`Data.TaggedError`, `Schema.TaggedError`). Everything else it
 *      exports is a type. It may re-export from its own files.
 */

export interface ContractsOptions {
  /** Contract folders, as paths from the folder that owns them: `services/*\/contract`. */
  readonly folders: readonly string[];
  /** Of those, the ones that must exist: `services/*\/contract`. A capability whose contract a package owns has none. */
  readonly required?: readonly string[];
}

const CONTRACT_CLASS =
  /^(Context\.(Service|Reference)|Data\.TaggedError|Schema\.TaggedError(Class)?)\b/;

export const contracts = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'A contract folder exists where it should, and exports only Context.Service and error classes as values.',
    },
    messages: {
      missing:
        '{{folder}} has no contract/. Put its Context.Service in {{folder}}/contract/index.ts.',
      value:
        '{{folder}} exports {{what}}. A contract exports only Context.Service and error classes as values, and everything else as types.',
      reexport:
        "{{folder}} re-exports '{{source}}' from outside itself. Declare it here, as a type or a Context.Service.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          folders: { type: 'array', items: { type: 'string' } },
          required: { type: 'array', items: { type: 'string' } },
        },
        required: ['folders'],
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const folders = stringsAt(context.options, 'folders');
    const required = stringsAt(context.options, 'required');
    const file = context.filename;
    const root = packageOf(dirname(file));
    const here = dirname(file);
    const name = (folder: string) => relative(root, folder);

    const contract = folders
      .map((pattern) => enclosing(here, pattern, root)?.folder)
      .find((folder) => folder !== undefined);

    const missing = isIndexFile(file)
      ? required
          .map((pattern) => {
            const holder = pattern.split('/').slice(0, -1).join('/');
            const last = pattern.split('/').at(-1) ?? '';
            const folder = holder
              ? enclosing(here, holder, root)?.folder
              : undefined;
            return folder && !isModule(join(folder, last)) ? folder : undefined;
          })
          .find((folder) => folder !== undefined)
      : undefined;

    if (!contract && !missing) return {};

    const value = (node: ESTree.Node, what: string) =>
      contract &&
      context.report({
        node,
        messageId: 'value',
        data: { folder: name(contract), what },
      });

    const reexport = (node: ESTree.StringLiteral) => {
      if (!contract) return;
      const target = resolveImport(file, node.value);
      if (target && isInside(target, contract)) return;
      context.report({
        node,
        messageId: 'reexport',
        data: { folder: name(contract), source: node.value },
      });
    };

    return {
      Program: (node) => {
        if (missing)
          context.report({
            node,
            messageId: 'missing',
            data: { folder: name(missing) },
          });
      },
      ExportNamedDeclaration: (node) => {
        if (node.exportKind === 'type') return;
        if (node.source) {
          if (node.specifiers.some((s) => s.exportKind !== 'type'))
            reexport(node.source);
          return;
        }
        const declaration = node.declaration;
        if (!declaration) {
          for (const specifier of node.specifiers)
            if (specifier.exportKind !== 'type')
              value(
                specifier,
                'a value by name; export the class where it is declared',
              );
          return;
        }
        switch (declaration.type) {
          case 'TSInterfaceDeclaration':
          case 'TSTypeAliasDeclaration':
            return;
          case 'ClassDeclaration': {
            const parent = declaration.superClass
              ? context.sourceCode.getText(declaration.superClass)
              : '';
            if (!CONTRACT_CLASS.test(parent))
              value(
                declaration,
                `the class ${declaration.id?.name ?? ''}, which is neither a Context.Service nor an error`,
              );
            return;
          }
          default:
            value(declaration, `a ${describe(declaration.type)}`);
        }
      },
      ExportAllDeclaration: (node) => {
        if (node.exportKind !== 'type') reexport(node.source);
      },
      ExportDefaultDeclaration: (node) => value(node, 'a default export'),
      TSExportAssignment: (node) => value(node, 'an export assignment'),
    };
  },
});

const describe = (type: string): string =>
  ({
    VariableDeclaration: 'variable',
    FunctionDeclaration: 'function',
    TSEnumDeclaration: 'enum',
    TSModuleDeclaration: 'namespace',
  })[type] ?? 'value';
