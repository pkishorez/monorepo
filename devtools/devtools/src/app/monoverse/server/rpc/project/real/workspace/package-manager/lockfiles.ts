import type { PackageManager } from '../../../contract/index.js';

export const lockfileNames: ReadonlyArray<
  readonly [name: string, packageManager: PackageManager]
> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];
