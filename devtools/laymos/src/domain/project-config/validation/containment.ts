import { posix } from 'node:path';

export function contains(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
}

export function overlaps(left: string, right: string): boolean {
  return contains(left, right) || contains(right, left);
}

export function isCanonicalPath(path: string, allowDot: boolean): boolean {
  if (path === '.') return allowDot;
  if (
    path.length === 0 ||
    path === '..' ||
    path.includes('\\') ||
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.startsWith('../') ||
    /^[A-Za-z]:/.test(path)
  ) {
    return false;
  }
  return posix.normalize(path) === path;
}
