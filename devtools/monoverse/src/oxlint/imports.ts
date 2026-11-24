import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import { importMessage, judgeImport } from '../shared/imports/index.ts';
import { settingsOf } from './package.ts';
import { resolveImport } from './resolve.ts';

/** `monoverse/imports`: every relative import keeps the package's imports rule. */
export const imports = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        "A file imports its own module, the index file of any module below it, or a door beside or above it, as its package's monoverse.json says.",
    },
    schema: [],
  },
  create(context) {
    const settings = settingsOf(context.filename);
    // A broken monoverse.json is told here only, so it shows once a file.
    if (settings.kind === 'invalid')
      return {
        Program: (node) => context.report({ node, message: settings.error }),
      };
    if (settings.kind === 'off') return {};
    const { file, root, tree, config } = settings;
    const rule = config.rules.imports;
    if (!rule) return {};

    const check = (source: ESTree.StringLiteral | null | undefined) => {
      if (!source || typeof source.value !== 'string') return;
      const target = resolveImport(file, source.value);
      if (!target) return;
      const verdict = judgeImport(tree, rule, file, target);
      if (!verdict.ok)
        context.report({
          node: source,
          message: importMessage(verdict, source.value, root),
        });
    };

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => {
        if (node.source.type === 'Literal')
          check(node.source as ESTree.StringLiteral);
      },
    };
  },
});
