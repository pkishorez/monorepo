import path from 'node:path';

/*
 * Every `View.lazy(() => import('./x'))` given the id of the module it
 * loads: its path from the Vite root, which is its key in the client
 * manifest. The server and the browser both see the same id, so a page
 * names the lazy Views it drew and the browser preloads them.
 */

const LAZY =
  /View\.lazy\(\s*\(\)\s*=>\s*import\(\s*(['"`])([^'"`]+)\1\s*\)\s*\)/g;

export const mentionsLazy = (code: string) => code.includes('View.lazy');

/** The code with an id on every lazy View that has none; `undefined` if there is none. */
export const withIds = async (
  code: string,
  root: string,
  resolve: (specifier: string) => Promise<string | undefined>,
): Promise<string | undefined> => {
  const found = [...code.matchAll(LAZY)];
  if (found.length === 0) return undefined;
  let out = '';
  let at = 0;
  for (const match of found) {
    const resolved = await resolve(match[2]!);
    if (!resolved) continue;
    const id = path
      .relative(root, resolved.split('?')[0]!)
      .split(path.sep)
      .join('/');
    const end = match.index + match[0].length - 1;
    out += `${code.slice(at, end)}, { id: ${JSON.stringify(id)} })`;
    at = end + 1;
  }
  return at === 0 ? undefined : out + code.slice(at);
};
