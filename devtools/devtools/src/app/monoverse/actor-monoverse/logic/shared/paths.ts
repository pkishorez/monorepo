import { parentOf } from '../../../server/rpc/contract/index.js';

/*
 * Paths as Monoverse reads them, as the contract's `paths.ts` writes them:
 * relative to the root, `/`-separated, the root itself `''`.
 */

/** The last segment of a path. */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Every folder a path sits in, nearest first, ending at the root `''`. */
export function ancestorsOf(path: string): ReadonlyArray<string> {
  const folders: Array<string> = [];
  let at = path;
  while (at !== '') {
    at = parentOf(at);
    folders.push(at);
  }
  return folders;
}
