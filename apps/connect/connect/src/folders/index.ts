import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, hostname, tmpdir } from 'node:os';
import { posix, win32 } from 'node:path';

const APP = 'connect';

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

const MOST_SOCKET = 103;

const PIPES = '\\\\.\\pipe\\';

export class FolderError extends Error {}

const basesOf = ({
  env = process.env,
  platform = process.platform,
  home = homedir(),
  tmp = tmpdir(),
  uid = process.getuid?.() ?? 0,
}: Where) => {
  if (platform === 'win32') {
    const local = env['LOCALAPPDATA'] || win32.join(home, 'AppData', 'Local');
    return {
      join: win32.join,
      data: win32.join(local, 'kestack'),
      state: win32.join(local, 'kestack', 'state'),
      cache: win32.join(local, 'kestack', 'cache'),
      runtime: null,
    };
  }
  const base = (variable: string, fallback: string) => {
    const value = env[variable];
    return value && posix.isAbsolute(value)
      ? value
      : posix.join(home, fallback);
  };
  const runtime = env['XDG_RUNTIME_DIR'];
  return {
    join: posix.join,
    data: posix.join(base('XDG_DATA_HOME', '.local/share'), 'kestack'),
    state: posix.join(base('XDG_STATE_HOME', '.local/state'), 'kestack'),
    cache: posix.join(base('XDG_CACHE_HOME', '.cache'), 'kestack'),
    runtime:
      runtime && posix.isAbsolute(runtime)
        ? posix.join(runtime, 'kestack')
        : posix.join(tmp, `kestack-${uid}`),
  };
};

export const checkName = (name: string) => {
  if (!NAME.test(name))
    throw new FolderError(
      `"${name}" is not a Connection name: use lowercase letters, digits and dashes, 63 at most`,
    );
};

export const connectionFolders = (name: string, where: Where = {}) => {
  checkName(name);
  const base = basesOf(where);
  const own = (folder: string) => base.join(folder, APP, 'connections', name);
  const short = createHash('sha256').update(name).digest('hex').slice(0, 8);
  const sockets =
    base.runtime === null
      ? { prefix: `${PIPES}kestack-${short}-`, suffix: '' }
      : { prefix: `${posix.join(base.runtime, short)}/`, suffix: '.sock' };
  const control = `${sockets.prefix}connect${sockets.suffix}`;
  if (base.runtime !== null && Buffer.byteLength(control) > MOST_SOCKET)
    throw new FolderError(
      `Socket paths under ${base.runtime} would be longer than ${MOST_SOCKET} bytes: set XDG_RUNTIME_DIR to a shorter folder`,
    );
  const data = own(base.data);
  const state = own(base.state);
  return {
    name,
    data,
    state,
    cache: base.cache,
    sockets,
    socketFolder:
      base.runtime === null ? null : posix.join(base.runtime, short),
    control,
    db: base.join(data, 'ke-connect.db'),
    backups: base.join(data, 'backups'),
    plugins: base.join(data, 'plugins'),
    log: base.join(state, 'connect.log'),
  };
};

export const connectionNames = (where: Where = {}): ReadonlyArray<string> => {
  const base = basesOf(where);
  const all = base.join(base.data, APP, 'connections');
  return existsSync(all)
    ? readdirSync(all, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];
};

export const createFolders = (paths: ReadonlyArray<string | null>) => {
  for (const path of paths) {
    if (path === null) continue;
    mkdirSync(path, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') chmodSync(path, 0o700);
  }
};

export const hostName = () => hostname().split('.')[0] || hostname();

export const computerName = (name: string) =>
  name === 'main' ? hostName() : `${hostName()} (${name})`;

export interface Where {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly home?: string;
  readonly tmp?: string;
  readonly uid?: number;
}
export type ConnectionFolders = ReturnType<typeof connectionFolders>;
