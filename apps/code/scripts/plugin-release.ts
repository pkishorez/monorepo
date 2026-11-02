import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * The Release of each Plugin this Code is built to call, which Vite
 * inlines as `import.meta.env.PLUGIN_CODE` and `PLUGIN_FILES` (ADR 0006
 * in @kestack/connect). A build names the latest Release in the Plugin's
 * Release Log, from the same commit, and fails without one. Under `pnpm
 * dev` it names the sha256 of the Plugin built here, `dist/plugin/<name>.mjs`,
 * as the dev Worker does (`releaseOf` in Connect's `infra/plugins/`), so a
 * Connection running it is called at its own hash; with no build, the
 * latest in the Log.
 */

/** The Plugins Code calls. */
export type Plugin = 'code' | 'files';

/** Where @kestack/connect is, as Code depends on it. */
const connect = (path: string) =>
  fileURLToPath(
    new URL(`../node_modules/@kestack/connect/${path}`, import.meta.url),
  );

const HASH = /^[a-f0-9]{64}$/;

/** The hash of the latest Release in the Plugin's Release Log; throws, saying how to make one, when there is none. */
const latestReleased = (plugin: Plugin) => {
  const file = connect(`src/plugins/${plugin}/releases.json`);
  if (!existsSync(file)) throw new Error(`No Release Log at ${file}`);
  const log = JSON.parse(readFileSync(file, 'utf8')) as {
    readonly releases?: ReadonlyArray<{ readonly hash?: unknown }>;
  };
  const hash = log.releases?.at(-1)?.hash;
  if (typeof hash !== 'string' || !HASH.test(hash))
    throw new Error(
      `${file} names no Release of the ${plugin} Plugin: Code is built to call one. ` +
        `Release it first: \`pnpm --filter @kestack/connect release:plugin ${plugin} "<what changed>"\`.`,
    );
  return hash;
};

/** The hash of the Plugin's Release this Code calls: under `dev`, the local build's when there is one. */
export const pluginRelease = (plugin: Plugin, dev: boolean): string => {
  const built = connect(`dist/plugin/${plugin}.mjs`);
  return dev && existsSync(built)
    ? createHash('sha256').update(readFileSync(built)).digest('hex')
    : latestReleased(plugin);
};
