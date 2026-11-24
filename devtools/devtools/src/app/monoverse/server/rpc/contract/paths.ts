/*
 * Paths as Monoverse reads them: relative to the root, `/`-separated, the
 * root itself `''`. A folder holds every path that starts with it.
 */

/** The folder a path sits directly in; `''` for one at the root. */
export function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** Whether `path` is `folder` itself or anything inside it, at any depth. */
export function isWithin(path: string, folder: string): boolean {
  return folder === '' || path === folder || path.startsWith(`${folder}/`);
}

/** A Package's `.` path, as the root itself. */
export function rootRelative(path: string): string {
  return path === '.' ? '' : path;
}

/** An absolute path under the home folder, written from `~`. */
export function shortenHome(path: string): string {
  const match = /^\/Users\/[^/]+|^\/home\/[^/]+/.exec(path);
  return match ? `~${path.slice(match[0].length)}` : path;
}
