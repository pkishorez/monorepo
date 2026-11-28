import type { ESTree, Rule } from '@oxlint/plugins';
import { isIndexFile } from '../shared/tree/index.ts';

type Kind = 'value' | 'type' | 'mixed';

const typeDeclarations = new Set([
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
]);

const kindOf = (statement: ESTree.Statement): Kind | undefined => {
  switch (statement.type) {
    case 'ExportNamedDeclaration': {
      if (statement.exportKind === 'type') return 'type';
      if (statement.declaration)
        return typeDeclarations.has(statement.declaration.type)
          ? 'type'
          : 'value';
      const types = statement.specifiers.filter(
        (specifier) => specifier.exportKind === 'type',
      ).length;
      if (types === 0) return 'value';
      return types === statement.specifiers.length ? 'type' : 'mixed';
    }
    case 'ExportAllDeclaration':
      return statement.exportKind === 'type' ? 'type' : 'value';
    case 'ExportDefaultDeclaration':
    case 'TSExportAssignment':
      return 'value';
    default:
      return undefined;
  }
};

export const valuesBeforeTypes: Rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'In an index file, export every value first and every type after them.',
    },
    messages: {
      valueAfterType:
        'An index file exports its values first, then its types. Move this above the type export on line {{line}}.',
      mixed:
        'Split this into `export { … }` for the values and `export type { … }` for the types.',
    },
    schema: [],
  },
  create(context) {
    if (!isIndexFile(context.filename)) return {};
    return {
      Program(program) {
        let firstType: ESTree.Statement | undefined;
        for (const statement of program.body) {
          const kind = kindOf(statement as ESTree.Statement);
          if (kind === 'mixed')
            context.report({ messageId: 'mixed', node: statement });
          else if (kind === 'type') firstType ??= statement as ESTree.Statement;
          else if (kind === 'value' && firstType)
            context.report({
              messageId: 'valueAfterType',
              data: { line: String(firstType.loc.start.line) },
              node: statement,
            });
        }
      },
    };
  },
};
