import type { PackageManager } from '../../../rpc/index.js';

/** Each lockfile and the Package Manager that writes it, checked in this order. */
export const lockfileNames: ReadonlyArray<
  readonly [name: string, packageManager: PackageManager]
> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];
