import type { Rule } from '@oxlint/plugins';

const isOwnFile = (source: string): boolean =>
  source.startsWith('.') || source.startsWith('/') || source.startsWith('#');

export const noStar: Rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Disallow `import * as` and `export *` of the package's own files: every import and export names what it takes. Imports and exports of other packages are not judged.",
    },
    messages: {
      importStar:
        "Import by name: `import { a, b } from '{{source}}'`, not the whole module.",
      exportStar:
        "Export by name: `export { a, b } from '{{source}}'`, so the file shows what it exposes.",
    },
    schema: [],
  },
  create(context) {
    return {
      ImportNamespaceSpecifier(node) {
        const parent = node.parent;
        if (parent.type !== 'ImportDeclaration') return;
        const source = parent.source.value;
        if (isOwnFile(source))
          context.report({ messageId: 'importStar', data: { source }, node });
      },
      ExportAllDeclaration(node) {
        const source = node.source.value;
        if (isOwnFile(source))
          context.report({ messageId: 'exportStar', data: { source }, node });
      },
    };
  },
};
