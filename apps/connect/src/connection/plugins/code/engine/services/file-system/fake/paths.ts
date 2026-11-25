/*
 * POSIX paths for the fake File System, as `node:path` gives them, without
 * Node: a browser tab runs the fake. Every path the tree keeps is absolute
 * and normal: no `.`, no `..`, no trailing or doubled `/`.
 */

/** `path` absolute and normal; one not starting with `/` is read from `/`. */
export const normalize = (path: string): string => {
  const parts: Array<string> = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
};

export const join = (...parts: ReadonlyArray<string>) =>
  normalize(parts.join('/'));

/** The folder `path` is in; `/` for `/`. */
export const dirname = (path: string) => {
  const normal = normalize(path);
  const cut = normal.lastIndexOf('/');
  return cut <= 0 ? '/' : normal.slice(0, cut);
};

/** The last name of `path`; empty for `/`. */
export const basename = (path: string) => {
  const normal = normalize(path);
  return normal.slice(normal.lastIndexOf('/') + 1);
};

/** The names on the way to `path`, from `/`. */
export const partsOf = (path: string) =>
  normalize(path).split('/').filter(Boolean);

/** Whether `path` is `folder` or below it. */
export const isWithin = (folder: string, path: string) =>
  folder === '/' || path === folder || path.startsWith(`${folder}/`);

/**
 * A path as a person writes it, made absolute: `~` and `~/…`
 * from home, `/…` as it is, anything else from home.
 */
export const fromHome = (home: string, given: string) => {
  const path = given.trim();
  if (path === '~') return home;
  if (path.startsWith('~/')) return join(home, path.slice(2));
  return path.startsWith('/') ? normalize(path) : join(home, path);
};
