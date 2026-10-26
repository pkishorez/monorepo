/*
 * A folder under a Connection's home, as a folder Step's key holds it: `~`
 * for the home folder, or `~/…` below it, which the server reads as it is. A path typed in the search
 * goes to the folder it names, from home with `~/`, or from the folder
 * open otherwise; `..` goes up, never above home.
 */

export const HOME = '~';

/** The folder `name` inside the folder `key`. */
export const inside = (key: string, name: string) => `${key}/${name}`;

const foldersOf = (key: string) =>
  key === HOME ? [] : key.slice(2).split('/');

const keyOf = (folders: ReadonlyArray<string>) =>
  folders.length === 0 ? HOME : `${HOME}/${folders.join('/')}`;

/**
 * The folders a typed path goes through, from home, each with its key, and
 * the part after the last `/` left to search; null for text with no `/`,
 * or a path from `/`, which names no folder by home.
 */
export const walk = (key: string, query: string) => {
  if (!query.includes('/') || query.startsWith('/')) return null;
  const fromHome = query.startsWith(`${HOME}/`);
  const parts = (fromHome ? query.slice(2) : query).split('/');
  const left = parts.pop() ?? '';
  const folders = fromHome ? [] : [...foldersOf(key)];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') folders.pop();
    else folders.push(part);
  }
  return {
    folders: folders.map((name, at) => ({
      name,
      key: keyOf(folders.slice(0, at + 1)),
    })),
    query: left,
  };
};
