const globSyntax = /[*?{}[\]]/;
const windowsAbsolutePath = /^[a-zA-Z]:\//;

/** Converts a configured path to project-root-relative POSIX form. */
export function normalizeConfigPath(path: string): string {
  if (path.length === 0) {
    throw new Error('Path must not be empty');
  }

  const unixPath = path.replaceAll('\\', '/');
  if (unixPath.startsWith('/') || windowsAbsolutePath.test(unixPath)) {
    throw new Error(`Path "${path}" must be relative to the project root`);
  }
  if (globSyntax.test(unixPath)) {
    throw new Error(`Path "${path}" must be a plain path, not a glob`);
  }

  const segments: string[] = [];
  for (const segment of unixPath.split('/')) {
    if (segment.length === 0 || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) {
        throw new Error(`Path "${path}" escapes the project root`);
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/') || '.';
}

export function pathContains(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
}
