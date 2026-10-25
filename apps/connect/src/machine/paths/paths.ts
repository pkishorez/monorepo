import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import { windowsFolders } from './windows.js';
import { xdgFolders } from './xdg.js';

/*
 * Where Connect keeps its files: the XDG folders under `kestack/` on macOS
 * and Linux, and their counterparts on Windows. In development each branch
 * is its own Connect, with its own Machine, so a branch's data and state
 * sit under `.branches/<branch>/`; config and cache are shared.
 */

/** Every file and folder Connect reads or writes. */
export interface ConnectPaths {
  /** Reserved for user settings; nothing is written yet. */
  readonly config: string;
  /** Connect's data folder, created 0700. */
  readonly data: string;
  /** Connect's state folder, created 0700. */
  readonly state: string;
  readonly cache: string;
  /** The SQLite database, chmod 0600 after it is first opened. */
  readonly db: string;
  readonly attachments: string;
  /** The Machine's id, name, Machine Key and owner, kept 0600. */
  readonly machine: string;
  readonly log: string;
  /** What development runs keep: the lock, connect.json and leases. */
  readonly dev: string;
  readonly cloudflared: string;
  /** What ai-toolkit is handed; it picks no path of its own. */
  readonly ai: {
    readonly models: string;
    readonly speech: string;
  };
}

/** A branch is a Portless host label, so it names a folder safely too. */
const BRANCH = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Where Connect keeps its files, for production or for one `branch`; throws on a bad branch. */
export const resolvePaths = ({
  branch,
  env = process.env,
  platform = process.platform,
  home = homedir(),
}: {
  readonly branch?: string | undefined;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly home?: string;
} = {}): ConnectPaths => {
  if (branch !== undefined && !BRANCH.test(branch)) {
    throw new Error(
      `"${branch}" is not a branch name: use lowercase letters, digits and dashes, 63 at most`,
    );
  }
  const windows = platform === 'win32';
  const { join } = windows ? win32 : posix;
  const base = windows ? windowsFolders(env, home) : xdgFolders(env, home);
  const perBranch = (folder: string) =>
    branch === undefined
      ? join(folder, 'connect')
      : join(folder, '.branches', branch, 'connect');

  const data = perBranch(base.data);
  const state = perBranch(base.state);
  const cache = join(base.cache, 'connect');
  return {
    config: join(base.config, 'connect'),
    data,
    state,
    cache,
    db: join(data, 'connect.db'),
    attachments: join(data, 'attachments'),
    machine: join(data, 'machine.json'),
    log: join(state, 'ke-connect.log'),
    dev: join(state, 'dev'),
    cloudflared: join(
      cache,
      'bin',
      windows ? 'cloudflared.exe' : 'cloudflared',
    ),
    ai: {
      models: join(cache, 'ai', 'models.json'),
      speech: join(cache, 'ai', 'speech-to-text'),
    },
  };
};
