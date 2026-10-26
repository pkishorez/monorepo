import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * What a deploy ships of each Plugin: its built file, named by its sha256,
 * at the key Cloud Connect's Worker serves it from, and the `PLUGINS` the
 * Worker tells every Connection. `pnpm build:plugin` prints the same hash.
 */

/** The code Plugin as `pnpm build:plugin` bundles it. */
export const CODE_BUNDLE = fileURLToPath(
  new URL('../dist/plugin/code.mjs', import.meta.url),
);

/** One Plugin's file as a deploy ships it. */
export interface PluginRelease {
  readonly name: string;
  /** The sha256 of its file, in hex. */
  readonly hash: string;
  /** Where the bucket keeps it, the same as its path on Cloud Connect. */
  readonly key: string;
  /** Where a Connection downloads it. */
  readonly url: string;
}

/** The sha256 of `bytes`, in hex. */
export const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

/** The release of the Plugin `name` whose file is `bytes`, served by Cloud Connect at `origin`. */
export const releaseOf = (
  name: string,
  bytes: Uint8Array,
  origin: string,
): PluginRelease => {
  const hash = sha256(bytes);
  const key = `plugins/${name}/${hash}.mjs`;
  return { name, hash, key, url: `${origin.replace(/\/+$/, '')}/${key}` };
};

/** The Worker's `PLUGINS`: each Plugin's hash and URL, by its name. */
export const pluginsEnv = (releases: ReadonlyArray<PluginRelease>) =>
  JSON.stringify(
    Object.fromEntries(
      releases.map(({ name, hash, url }) => [name, { hash, url }]),
    ),
  );

/** The code Plugin built at `file`, served by Cloud Connect at `origin`; null when it is not built. */
export const builtCode = (
  origin: string,
  file: string = CODE_BUNDLE,
): PluginRelease | null =>
  existsSync(file) ? releaseOf('code', readFileSync(file), origin) : null;

/** The version of Connect in `package.json`, which the Worker tells every Connection. */
export const connectVersion = (): string =>
  (
    JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { readonly version: string }
  ).version;
