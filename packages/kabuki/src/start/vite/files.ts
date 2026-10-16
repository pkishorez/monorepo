import { existsSync } from 'node:fs';
import path from 'node:path';

/*
 * The app's two files, found by name under the Vite root: each a path
 * without its extension, found as `.tsx`, `.ts`, `.jsx` or `.js`, and each
 * one overridable. What each needs, its Layer and the app's Document, is
 * written in it.
 */

/** Where Start finds each of the app's files, from the Vite root. */
export interface FileOptions {
  /**
   * Default-exports the app, with its Document and what it needs in the
   * browser: `Start.app(router, AppView, { … })`, from
   * `@kestack/kabuki/start`. By default `src/app`.
   */
  readonly app?: string;
  /**
   * Default-exports the Loaders, with what they need on the server:
   * `Start.layers()…loaders(Routes.loaders({ … }))`, from
   * `@kestack/kabuki/start/server`; optional. By default
   * `src/loaders.server`.
   */
  readonly loaders?: string;
}

export interface Files {
  readonly app: string;
  readonly loaders: string | undefined;
}

const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mts', '.mjs'];

/** The file at `name`, as written or with the first extension that exists. */
const find = (root: string, name: string): string | undefined => {
  const at = path.resolve(root, name);
  if (path.extname(at) && existsSync(at)) return at;
  return EXTENSIONS.map((extension) => `${at}${extension}`).find((file) =>
    existsSync(file),
  );
};

const required = (root: string, name: string, what: string) => {
  const found = find(root, name);
  if (!found)
    throw new Error(
      `[@kestack/kabuki/start] no ${what} at ${path.join(root, name)}: write it, or name where it is in start({ … })`,
    );
  return found;
};

export const findFiles = (root: string, options: FileOptions): Files => ({
  app: required(root, options.app ?? 'src/app', 'app'),
  // Left out, it may be missing; named in the options, it must be there.
  loaders: options.loaders
    ? required(root, options.loaders, 'Loaders')
    : find(root, 'src/loaders.server'),
});
