import { existsSync } from 'node:fs';
import path from 'node:path';

/*
 * The app's files, found by name under the Vite root: each a path without
 * its extension, found as `.tsx`, `.ts`, `.jsx` or `.js`, and each one
 * overridable.
 */

/** Where Start finds each of the app's files, from the Vite root. */
export interface FileOptions {
  /** Default-exports the app the Router serves, `Router.app(Routes, App)`. By default `src/app`. */
  readonly app?: string;
  /** Default-exports the Document, the HTML around the app; optional. By default `src/document`. */
  readonly document?: string;
  /** Default-exports the Loaders, `Routes.loaders({ … })`; optional. By default `src/loaders.server`. */
  readonly loaders?: string;
  /**
   * Default-exports what the Loaders Require: a Layer, or a function of the
   * Worker's env that makes one, for each request; optional. By default
   * `src/layer.server`.
   */
  readonly serverLayer?: string;
  /** Default-exports what the app's Actors Require in the browser, a Layer; optional. By default `src/layer.client`. */
  readonly clientLayer?: string;
}

export interface Files {
  readonly app: string;
  readonly document: string | undefined;
  readonly loaders: string | undefined;
  readonly serverLayer: string | undefined;
  readonly clientLayer: string | undefined;
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

/** A file that may be left out: if it is named in the options, it must be there. */
const optional = (
  root: string,
  named: string | undefined,
  fallback: string,
  what: string,
) => (named ? required(root, named, what) : find(root, fallback));

export const findFiles = (root: string, options: FileOptions): Files => ({
  app: required(root, options.app ?? 'src/app', 'app'),
  document: optional(root, options.document, 'src/document', 'Document'),
  loaders: optional(root, options.loaders, 'src/loaders.server', 'Loaders'),
  serverLayer: optional(
    root,
    options.serverLayer,
    'src/layer.server',
    'server Layer',
  ),
  clientLayer: optional(
    root,
    options.clientLayer,
    'src/layer.client',
    'client Layer',
  ),
});
