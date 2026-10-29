import { describe, expect, it } from 'vitest';
import {
  folders,
  pluginFolders,
  pluginShared,
  socketPath,
} from '../folders.js';

const home = '/home/ada';
const unix = {
  env: {},
  platform: 'linux',
  home,
  tmp: '/tmp',
  uid: 501,
} as const;

describe('folders on macOS and Linux', () => {
  it('uses the XDG defaults under kestack, with a runtime folder of the user’s own', () => {
    expect(folders({ app: 'connect', name: 'work', ...unix })).toEqual({
      data: '/home/ada/.local/share/kestack/connect/connections/work',
      state: '/home/ada/.local/state/kestack/connect/connections/work',
      cache: '/home/ada/.cache/kestack',
      shared: '/home/ada/.local/share/kestack',
      runtime: '/tmp/kestack-501',
    });
  });

  it('follows each XDG variable, and ignores a relative one', () => {
    const paths = folders({
      app: 'connect',
      name: 'work',
      ...unix,
      env: {
        XDG_DATA_HOME: '/x/data',
        XDG_STATE_HOME: '/x/state',
        XDG_CACHE_HOME: 'relative',
        XDG_RUNTIME_DIR: '/run/user/501',
      },
    });
    expect(paths).toEqual({
      data: '/x/data/kestack/connect/connections/work',
      state: '/x/state/kestack/connect/connections/work',
      cache: '/home/ada/.cache/kestack',
      shared: '/x/data/kestack',
      runtime: '/run/user/501/kestack',
    });
  });

  it('shares the cache between names and CLIs', () => {
    const a = folders({ app: 'connect', name: 'a', ...unix });
    const b = folders({ app: 'other', name: 'b', ...unix });
    expect(a.cache).toBe(b.cache);
    expect(a.shared).toBe(b.shared);
    expect(a.data).not.toBe(b.data);
  });

  it('gives a Plugin folders inside its CLI’s', () => {
    const cli = folders({ app: 'connect', name: 'work', ...unix });
    expect(pluginFolders(cli, 'code')).toEqual({
      data: '/home/ada/.local/share/kestack/connect/connections/work/plugins/code',
      state:
        '/home/ada/.local/state/kestack/connect/connections/work/plugins/code',
      cache: '/home/ada/.cache/kestack/plugins/code',
      shared: '/home/ada/.local/share/kestack/code',
    });
  });

  it('finds a Plugin’s shared folder from the environment alone, as its CLI would', () => {
    for (const env of [{}, { XDG_DATA_HOME: '/x/data' }]) {
      const cli = folders({ app: 'connect', name: 'work', ...unix, env });
      expect(pluginShared({ plugin: 'code', ...unix, env })).toBe(
        pluginFolders(cli, 'code').shared,
      );
    }
    const windows = { platform: 'win32', home: 'C:\\Users\\ada' } as const;
    const env = { LOCALAPPDATA: 'D:\\Local' };
    expect(pluginShared({ plugin: 'code', ...windows, env })).toBe(
      pluginFolders(
        folders({ app: 'connect', name: 'work', ...windows, env }),
        'code',
      ).shared,
    );
  });
});

describe('folders on Windows', () => {
  it('keeps everything in LOCALAPPDATA, with named pipes for sockets', () => {
    const paths = folders({
      app: 'connect',
      name: 'work',
      env: { LOCALAPPDATA: 'D:\\Local' },
      platform: 'win32',
      home: 'C:\\Users\\ada',
    });
    expect(paths).toEqual({
      data: 'D:\\Local\\kestack\\connect\\connections\\work',
      state: 'D:\\Local\\kestack\\state\\connect\\connections\\work',
      cache: 'D:\\Local\\kestack\\cache',
      shared: 'D:\\Local\\kestack',
      runtime: '\\\\.\\pipe\\',
    });
    expect(pluginFolders(paths, 'code').data).toBe(
      'D:\\Local\\kestack\\connect\\connections\\work\\plugins\\code',
    );
    expect(pluginFolders(paths, 'code').shared).toBe(
      'D:\\Local\\kestack\\code',
    );
    expect(socketPath(paths.runtime, 'f00dcafe1234', 'code')).toBe(
      '\\\\.\\pipe\\kestack-f00dcafe-code',
    );
  });

  it('falls back to the default folder when LOCALAPPDATA is missing', () => {
    const paths = folders({
      app: 'connect',
      name: 'work',
      env: {},
      platform: 'win32',
      home: 'C:\\Users\\ada',
    });
    expect(paths.cache).toBe('C:\\Users\\ada\\AppData\\Local\\kestack\\cache');
  });
});

describe('socketPath', () => {
  it('stays short under a typical macOS temporary folder', () => {
    const tmp = '/var/folders/7x/0a1b2c3d4e5f6g7h8i9j0k1l2m3n/T';
    const { runtime } = folders({ app: 'connect', name: 'work', ...unix, tmp });
    const path = socketPath(runtime, '01J9Z3K4M5N6P7Q8R9S0T1V2W3', 'code');
    expect(path).toBe(
      '/var/folders/7x/0a1b2c3d4e5f6g7h8i9j0k1l2m3n/T/kestack-501/01J9Z3K4/code.sock',
    );
    expect(Buffer.byteLength(path)).toBeLessThan(104);
  });

  it('refuses a path too long to listen on', () => {
    expect(() =>
      socketPath(`/${'x'.repeat(80)}`, 'abcdefgh', 'a'.repeat(30)),
    ).toThrow('longer than 103 bytes');
  });
});

describe('names', () => {
  it('are DNS labels', () => {
    for (const name of ['', 'Work', '-x', 'a/b', '../up', 'a'.repeat(64)]) {
      expect(() => folders({ app: 'connect', name, ...unix })).toThrow(
        'is not a connection name',
      );
      const cli = folders({ app: 'connect', name: 'work', ...unix });
      expect(() => pluginFolders(cli, name)).toThrow('is not a plugin name');
    }
    expect(() =>
      folders({ app: 'connect', name: 'a'.repeat(63), ...unix }),
    ).not.toThrow();
  });
});
