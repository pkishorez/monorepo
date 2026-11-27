export function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

export function isWithin(path: string, folder: string): boolean {
  return folder === '' || path === folder || path.startsWith(`${folder}/`);
}

export function rootRelative(path: string): string {
  return path === '.' ? '' : path;
}

export function shortenHome(path: string): string {
  const match = /^\/Users\/[^/]+|^\/home\/[^/]+/.exec(path);
  return match ? `~${path.slice(match[0].length)}` : path;
}
