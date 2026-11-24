import { existsSync } from 'node:fs';
import { resolveRelative } from '../shared/resolve/index.ts';

/** The file a relative import names on the disk, or `undefined` for anything else. */
export const resolveImport = (
  from: string,
  specifier: string,
): string | undefined => resolveRelative(from, specifier, existsSync);
