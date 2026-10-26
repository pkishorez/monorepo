import { chmodSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, posix, win32 } from 'node:path';
import { Data, Effect } from 'effect';
import { PIPES, windowsFolders } from './windows.js';
import { xdgFolders, xdgRuntime } from './xdg.js';

/*
 * Where a kestack CLI keeps its files. Each named copy of a CLI, such as a
 * Connection, has data and state folders of its own; the cache is one for
 * every name and every kestack CLI, so a download is kept once per
 * computer. Sockets go in a short runtime folder, or are named pipes on
 * Windows. A Plugin gets folders of its own inside its CLI's.
 */

/** Every folder one named copy of a CLI uses. */
export interface Folders {
  /** What it keeps: `<data>/kestack/<app>/connections/<name>`. */
  readonly data: string;
  /** What it may lose, as logs: `<state>/kestack/<app>/connections/<name>`. */
  readonly state: string;
  /** Shared by every name and every kestack CLI: `<cache>/kestack`. */
  readonly cache: string;
  /** Where its sockets go; the named-pipe prefix on Windows. */
  readonly runtime: string;
}

/** The folders of one Plugin, inside its CLI's. */
export interface PluginFolders {
  readonly data: string;
  readonly state: string;
  readonly cache: string;
}

/** What makes a folder's name safe on every platform: a DNS label. */
const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The longest Unix socket path every platform takes; macOS allows 104 bytes with the ending zero. */
const MOST_SOCKET = 103;

/** A folder that could not be made. */
export class FolderError extends Data.TaggedError('FolderError')<{
  readonly path: string;
  readonly message: string;
}> {}

const checkName = (what: string, name: string) => {
  if (!NAME.test(name))
    throw new Error(
      `"${name}" is not a ${what} name: use lowercase letters, digits and dashes, 63 at most`,
    );
};

/**
 * Where the CLI `app` keeps the files of `name`, one named copy of it, such
 * as a Connection; throws on a bad `app` or `name`. `env`, `platform`,
 * `home`, `tmp` and `uid` are this process's unless given.
 */
export const folders = ({
  app,
  name,
  env = process.env,
  platform = process.platform,
  home = homedir(),
  tmp = tmpdir(),
  uid = process.getuid?.() ?? 0,
}: {
  readonly app: string;
  readonly name: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly home?: string;
  readonly tmp?: string;
  readonly uid?: number;
}): Folders => {
  checkName('CLI', app);
  checkName('connection', name);
  const windows = platform === 'win32';
  const { join } = windows ? win32 : posix;
  const base = windows ? windowsFolders(env, home) : xdgFolders(env, home);
  const own = (folder: string) => join(folder, app, 'connections', name);
  return {
    data: own(base.data),
    state: own(base.state),
    cache: base.cache,
    runtime: windows ? PIPES : xdgRuntime(env, tmp, uid),
  };
};

/** The name of every copy of the CLI `app` with a data folder on this computer, sorted. */
export const names = (app: string): ReadonlyArray<string> => {
  const all = dirname(folders({ app, name: 'main' }).data);
  return existsSync(all)
    ? readdirSync(all, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];
};

/**
 * The socket `file` of the copy `id` names, short enough for a Unix socket:
 * `<runtime>/<id's first 8>/<file>.sock`, or the named pipe
 * `\\.\pipe\kestack-<id's first 8>-<file>` on Windows. Throws on a bad
 * `file`, or a path too long to listen on.
 */
export const socketPath = (runtime: string, id: string, file: string) => {
  checkName('socket', file);
  const short = id.slice(0, 8);
  if (runtime === PIPES) return `${PIPES}kestack-${short}-${file}`;
  const path = posix.join(runtime, short, `${file}.sock`);
  if (Buffer.byteLength(path) > MOST_SOCKET)
    throw new Error(
      `The socket path ${path} is longer than ${MOST_SOCKET} bytes: set XDG_RUNTIME_DIR to a shorter folder`,
    );
  return path;
};

/** The folders of the Plugin `plugin`; throws on a bad name. */
export const pluginFolders = (
  { data, state, cache }: Folders,
  plugin: string,
): PluginFolders => {
  checkName('plugin', plugin);
  const { join } = data.includes('\\') ? win32 : posix;
  return {
    data: join(data, 'plugins', plugin),
    state: join(state, 'plugins', plugin),
    cache: join(cache, 'plugins', plugin),
  };
};

/** Makes every folder in `folders` that is missing, readable by this user alone. */
export const createFolders = (folders: Folders | PluginFolders) =>
  Effect.forEach(
    Object.values(folders).filter((path) => path !== PIPES),
    (path) =>
      Effect.try({
        try: () => {
          mkdirSync(path, { recursive: true, mode: 0o700 });
          // A runtime folder in the shared temporary folder may have been
          // made by someone else first; it must be this user's alone.
          if (process.platform !== 'win32') chmodSync(path, 0o700);
        },
        catch: (cause) =>
          new FolderError({
            path,
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
    { discard: true },
  );
