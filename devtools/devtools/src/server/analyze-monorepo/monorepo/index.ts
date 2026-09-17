// Reads a pnpm Monorepo's workspace globs and every Package manifest they match.
export { loadMonorepo } from './monorepo.js';
export type { LoadedMonorepo } from './monorepo.js';
export { MonorepoReadError } from './errors.js';
// Manifest failures surface through the Monorepo door so callers need one import.
export { ManifestError } from '../package/index.js';
