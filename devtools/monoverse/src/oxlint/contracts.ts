import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import {
  contractClass,
  contractMessages,
  contractOf,
  missingContract,
} from '../shared/contracts/index.ts';
import { isInside } from '../shared/tree/index.ts';
import { settingsOf } from './package.ts';
import { resolveImport } from './resolve.ts';

/** `monoverse/contracts`: contract folders exist where required, and export only contexts. */
export const contracts = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        "A contract folder exists where its package's monoverse.json requires one, and exports only Context.Service and error classes as values.",
    },
    schema: [],
  },
  create(context) {
    const settings = settingsOf(context.filename);
    if (settings.kind !== 'on') return {};
    const { file, root, tree, config } = settings;
    const rule = config.rules.contracts;
    if (!rule) return {};

    const contract = contractOf(rule, file, root);
    const missing = missingContract(tree, rule, file, root);
    if (!contract && !missing) return {};

    const value = (node: ESTree.Node, what: string) =>
      contract &&
      context.report({
        node,
        message: contractMessages.value(contract, root, what),
      });

    const reexport = (node: ESTree.StringLiteral) => {
      if (!contract) return;
      const target = resolveImport(file, node.value);
      if (target && isInside(target, contract)) return;
      context.report({
        node,
        message: contractMessages.reexport(contract, root, node.value),
      });
    };

    return {
      Program: (node) => {
        if (missing)
          context.report({
            node,
            message: contractMessages.missing(missing, root),
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
            if (!contractClass.test(parent))
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
