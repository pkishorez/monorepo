import { matchesGlob } from 'node:path/posix';
import type { PrecacheEntry } from '../../domain/build/index.js';
import { isDefaultAsset, isHtml, isSourceMap } from './asset-kind.js';
import { revisionOf } from './revision.js';
import { outputPathOf, urlOf } from './url-path.js';

/** One file under the client outDir; `path` is relative and uses `/`. */
export interface OutputFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface Selection {
  readonly entries: ReadonlyArray<PrecacheEntry>;
  readonly bytes: number;
}

const entryOf = (file: OutputFile, url: string): PrecacheEntry => ({
  url,
  revision: revisionOf(file.bytes),
});

const selection = (
  picked: ReadonlyArray<readonly [OutputFile, string]>,
): Selection => ({
  entries: picked.map(([file, url]) => entryOf(file, url)),
  bytes: picked.reduce((sum, [file]) => sum + file.bytes.byteLength, 0),
});

/**
 * Every Precache entry except HTML documents: scripts, styles, fonts and the
 * manifest icons, plus `include` matches, minus `exclude` matches. Source
 * maps and other images stay out unless `include` names them. HTML never
 * comes in here, because the Build ID is computed from this list and the
 * documents embed the Build ID.
 */
export const selectAssets = (
  files: ReadonlyArray<OutputFile>,
  options: {
    readonly include: ReadonlyArray<string>;
    readonly exclude: ReadonlyArray<string>;
    readonly iconUrls: ReadonlyArray<string>;
    readonly base: string;
  },
): Selection & { readonly missingIcons: ReadonlyArray<string> } => {
  const matches = (globs: ReadonlyArray<string>, path: string) =>
    globs.some((glob) => matchesGlob(path, glob));
  const iconPaths = new Map(
    options.iconUrls.flatMap((url) => {
      const path = outputPathOf(url, options.base);
      return path === null ? [] : [[path, url] as const];
    }),
  );
  const picked = files.filter(
    (file) =>
      !isHtml(file.path) &&
      !matches(options.exclude, file.path) &&
      (matches(options.include, file.path) ||
        iconPaths.has(file.path) ||
        (isDefaultAsset(file.path) && !isSourceMap(file.path))),
  );
  const present = new Set(files.map((file) => file.path));
  return {
    ...selection(picked.map((file) => [file, urlOf(file.path, options.base)])),
    missingIcons: [...iconPaths]
      .filter(([path]) => !present.has(path))
      .map(([, url]) => url),
  };
};

/**
 * The prerendered App Shell and Offline Fallback. Each is keyed by its
 * navigation path (`/_shell`, `/offline`), which is what the worker looks
 * up; the file is `<path>.html`, or `<path>/index.html` as a second choice
 * (hosts that serve it only at `<path>/` then redirect, so it is reported).
 */
export const selectDocuments = (
  files: ReadonlyArray<OutputFile>,
  paths: ReadonlyArray<string>,
): Selection & {
  readonly missing: ReadonlyArray<string>;
  readonly subfolderIndex: ReadonlyArray<string>;
} => {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const found = paths.map((path) => {
    const flat = byPath.get(`${path.slice(1)}.html`);
    const nested = byPath.get(`${path.slice(1)}/index.html`);
    return { path, file: flat ?? nested, nested: !flat && !!nested };
  });
  return {
    ...selection(
      found.flatMap(({ path, file }) => (file ? [[file, path] as const] : [])),
    ),
    missing: found.filter(({ file }) => !file).map(({ path }) => path),
    subfolderIndex: found.filter((f) => f.nested).map(({ path }) => path),
  };
};
