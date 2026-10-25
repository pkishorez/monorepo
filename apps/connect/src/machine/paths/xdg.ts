import { posix } from 'node:path';

/*
 * Where macOS and Linux keep a program's files: the XDG Base Directory
 * folders, each overridden by its variable. The XDG spec ignores a value
 * that is not an absolute path, so a relative one falls back too.
 */

const DEFAULTS = {
  config: ['XDG_CONFIG_HOME', '.config'],
  data: ['XDG_DATA_HOME', '.local/share'],
  state: ['XDG_STATE_HOME', '.local/state'],
  cache: ['XDG_CACHE_HOME', '.cache'],
} as const;

type Kind = keyof typeof DEFAULTS;

/** The four base folders, each with `kestack` added. */
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
    config: posix.join(base('config'), 'kestack'),
    data: posix.join(base('data'), 'kestack'),
    state: posix.join(base('state'), 'kestack'),
    cache: posix.join(base('cache'), 'kestack'),
  };
};
