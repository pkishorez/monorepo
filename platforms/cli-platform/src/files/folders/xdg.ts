import { posix } from 'node:path';

/*
 * Where macOS and Linux keep a program's files: the XDG Base Directory
 * folders, each overridden by its variable. The XDG spec ignores a value
 * that is not an absolute path, so a relative one falls back too.
 */

const DEFAULTS = {
  data: ['XDG_DATA_HOME', '.local/share'],
  state: ['XDG_STATE_HOME', '.local/state'],
  cache: ['XDG_CACHE_HOME', '.cache'],
} as const;

type Kind = keyof typeof DEFAULTS;

/** The data, state and cache folders, each with `kestack` added. */
export const xdgFolders = (
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): Record<Kind, string> => {
  const base = (kind: Kind) => {
    const [variable, fallback] = DEFAULTS[kind];
    const value = env[variable];
    return value && posix.isAbsolute(value)
      ? value
      : posix.join(home, fallback);
  };
  return {
    data: posix.join(base('data'), 'kestack'),
    state: posix.join(base('state'), 'kestack'),
    cache: posix.join(base('cache'), 'kestack'),
  };
};

/**
 * Where sockets go: `$XDG_RUNTIME_DIR/kestack` when set, else a folder of
 * this user's own in the temporary folder. Both are short, for a Unix
 * socket path is limited to about 104 bytes.
 */
export const xdgRuntime = (
  env: Readonly<Record<string, string | undefined>>,
  tmp: string,
  uid: number,
) => {
  const runtime = env['XDG_RUNTIME_DIR'];
  return runtime && posix.isAbsolute(runtime)
    ? posix.join(runtime, 'kestack')
    : posix.join(tmp, `kestack-${uid}`);
};
