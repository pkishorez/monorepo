import { definePlugin } from '@oxlint/plugins';
import { contracts } from './contracts/index.ts';
import { imports } from './imports/index.ts';

export type { ContractsOptions } from './contracts/index.ts';
export type { ImportsOptions } from './imports/index.ts';

/** The oxlint plugin: its rules are `kestack/imports` and `kestack/contracts`. */
export default definePlugin({
  meta: { name: 'kestack' },
  rules: { imports, contracts },
});
