import { definePlugin } from '@oxlint/plugins';
import { contracts } from './contracts.ts';
import { imports } from './imports.ts';

/**
 * The oxlint plugin `monoverse`, with `monoverse/imports` and
 * `monoverse/contracts`. Both take no options: each file is checked as
 * its package's `monoverse.json` says, and not at all without one.
 */
export default definePlugin({
  meta: { name: 'monoverse' },
  rules: { imports, contracts },
});
