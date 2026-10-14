import type { Assets } from '../common/index.ts';
import { ENTRY } from './entries.ts';

/*
 * Vite's client manifest, read into the files the Worker writes in a page:
 * the entry's, and each lazy View's, by its id, which is the key of its
 * module in the manifest.
 */

interface Chunk {
  readonly file: string;
  readonly name?: string;
  readonly isEntry?: boolean;
  readonly isDynamicEntry?: boolean;
  readonly imports?: ReadonlyArray<string>;
  readonly css?: ReadonlyArray<string>;
}

export type Manifest = Readonly<Record<string, Chunk>>;

/** A chunk's script, its styles and those of every chunk it imports, and those chunks. */
const assetsOf = (manifest: Manifest, key: string, base: string): Assets => {
  const styles = new Set<string>();
  const preloads = new Set<string>();
  const seen = new Set<string>();
  const walk = (at: string) => {
    if (seen.has(at)) return;
    seen.add(at);
    const chunk = manifest[at];
    if (!chunk) return;
    for (const css of chunk.css ?? []) styles.add(`${base}${css}`);
    for (const imported of chunk.imports ?? []) {
      const file = manifest[imported]?.file;
      if (file) preloads.add(`${base}${file}`);
      walk(imported);
    }
  };
  walk(key);
  return {
    script: `${base}${manifest[key]!.file}`,
    styles: [...styles],
    preloads: [...preloads],
  };
};

export const filesOf = (manifest: Manifest, base: string) => {
  const entries = Object.entries(manifest);
  const entry =
    entries.find(([, chunk]) => chunk.isEntry && chunk.name === ENTRY) ??
    entries.find(([, chunk]) => chunk.isEntry);
  if (!entry)
    throw new Error(
      '[@kestack/kabuki/start] the client build has no entry: is another plugin building the client?',
    );
  return {
    entry: assetsOf(manifest, entry[0], base),
    views: Object.fromEntries(
      entries
        .filter(([, chunk]) => chunk.isDynamicEntry)
        .map(([key]) => [key, assetsOf(manifest, key, base)]),
    ),
  };
};
