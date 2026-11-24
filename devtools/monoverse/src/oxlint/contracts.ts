import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import { contractFindings } from '../shared/contracts/index.ts';
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
    return {
      Program: (program) => {
        const findings = contractFindings(
          tree,
          rule,
          file,
          root,
          program,
          (specifier) => resolveImport(file, specifier),
        );
        for (const { node, message } of findings)
          context.report({ node: node as ESTree.Node, message });
      },
    };
  },
});
