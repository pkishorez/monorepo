import { PluginAccess, PluginPaths } from '../contract/index.js';

/*
 * Which part of a Plugin a request may reach. Its CLI says on every request
 * it passes on whether the caller holds its key, in the PluginAccess
 * header. A request it marks public reaches the Public Area alone. A path
 * under `/public/` is the Public Area, whoever asks, but only by a plain
 * path: no `.` or `..` segment, no empty one, and no `/`, `\` or `.`
 * written encoded. Any other path is the keyed part, the RPC group,
 * PluginControl and the Plugin's own routes, for a caller marked as
 * holding the key. A request with no header at all depends on the CLI. One
 * that says, in PluginEnv's `access`, that it marks every request passed
 * on none without it, so such a request reaches nothing, Public Area
 * included. One that does not say so is older than the Public Area and
 * passed on only what held the key, so its unmarked request is taken as
 * holding it: only the CLI's own socket, in a folder only its user may
 * open, reaches a Plugin. Anything else reaches nothing, and answers 404
 * as a path that is not there would.
 */

/** Where a request may go: the Public Area, the keyed part, or nowhere. */
export type Area = 'public' | 'keyed' | null;

/** A `/`, `\` or `.` written encoded, which a decoder would turn into a path of its own. */
const ENCODED = /%(2f|5c|2e)/i;

/** Whether `path`, already under `/public`, is plain enough to reach the Public Area. */
const plain = (path: string) =>
  !ENCODED.test(path) &&
  !path.includes('\\') &&
  path
    .slice(1)
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..');

/**
 * The part of the Plugin a request with this URL and headers may reach;
 * `marked` when its CLI says it marks every request it passes on.
 */
export const areaOf = (
  request: {
    readonly url: string;
    readonly headers: Readonly<Record<string, string | undefined>>;
  },
  marked: boolean,
): Area => {
  const access = request.headers[PluginAccess.header];
  if (marked && access === undefined) return null;
  const path = request.url.split(/[?#]/, 1)[0] ?? '';
  if (path === PluginPaths.public || path.startsWith(`${PluginPaths.public}/`))
    return plain(path) ? 'public' : null;
  return path.startsWith('/') &&
    (access === undefined || access === PluginAccess.key)
    ? 'keyed'
    : null;
};
