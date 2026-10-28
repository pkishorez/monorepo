import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * The Release of the code Plugin this Code is built to call, which Vite
 * inlines as `import.meta.env.PLUGIN_CODE` (ADR 0006 in @kestack/connect).
 * A build names the latest Release in the code Plugin's Release Log, from
 * the same commit, and fails without one. Under `pnpm dev` it names the
 * sha256 of the Plugin built here, `dist/plugin/code.mjs`, as the dev
 * Worker does (`releaseOf` in Connect's `infra/plugins/`), so a Connection
 * running it is called at its own hash; with no build, the latest in the
 * Log.
 */

/** Where @kestack/connect is, as Code depends on it. */
const connect = (path: string) =>
  fileURLToPath(
    new URL(`../node_modules/@kestack/connect/${path}`, import.meta.url),
  );

const HASH = /^[a-f0-9]{64}$/;

/** The hash of the latest Release in the code Plugin's Release Log; throws when there is none. */
const latestReleased = () => {
  const file = connect('src/plugins/code/releases.json');
  if (!existsSync(file)) throw new Error(`No Release Log at ${file}`);
  const log = JSON.parse(readFileSync(file, 'utf8')) as {
    readonly releases?: ReadonlyArray<{ readonly hash?: unknown }>;
  };
  const hash = log.releases?.at(-1)?.hash;
  if (typeof hash !== 'string' || !HASH.test(hash))
    throw new Error(`${file} names no Release of the code Plugin`);
  return hash;
};

/** The hash of the code Plugin's Release this Code calls: under `dev`, the local build's when there is one. */
export const pluginCode = (dev: boolean): string => {
  const built = connect('dist/plugin/code.mjs');
  return dev && existsSync(built)
    ? createHash('sha256').update(readFileSync(built)).digest('hex')
    : latestReleased();
};
