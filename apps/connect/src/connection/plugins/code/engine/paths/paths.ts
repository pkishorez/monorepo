/*
 * The few path operations the engine does itself, on POSIX paths, as every
 * path of a Connection is: without `node:path`, so the engine runs in a
 * browser tab too. Every path given is absolute, but for `absolute`'s.
 */

const partsOf = (path: string) =>
  path.split('/').filter((part) => part !== '' && part !== '.');

/** `path` with no `.`, `..` or doubled `/`. */
const normalize = (path: string) => {
  const out: Array<string> = [];
  for (const part of partsOf(path)) {
    if (part === '..') out.pop();
    else out.push(part);
  }
  return `/${out.join('/')}`;
};

/** The paths joined into one, normalized. */
export const join = (first: string, ...rest: ReadonlyArray<string>) =>
  normalize([first, ...rest].join('/'));

/** The last part of `path`: its file or folder's name. */
export const basename = (path: string) => partsOf(path).at(-1) ?? '';

/** The path from `from` to `to`; '' when they are the same. */
export const relative = (from: string, to: string) => {
  const a = partsOf(normalize(from));
  const b = partsOf(normalize(to));
  let same = 0;
  while (same < a.length && same < b.length && a[same] === b[same]) same++;
  return [...a.slice(same).map(() => '..'), ...b.slice(same)].join('/');
};

/** A path the user gave, made absolute: `~` is `home`, as is the folder a relative path starts in. */
export const absolute = (home: string, given: string) =>
  given === '~' || given.startsWith('~/')
    ? join(home, given.slice(1))
    : given.startsWith('/')
      ? normalize(given)
      : join(home, given);
