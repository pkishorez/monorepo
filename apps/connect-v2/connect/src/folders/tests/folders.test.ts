import { describe, expect, it } from 'vitest';
import { connectionFolders } from '../index.js';

const linux = {
  env: { XDG_RUNTIME_DIR: '/run/user/1000' },
  platform: 'linux' as const,
  home: '/home/ada',
  tmp: '/tmp',
  uid: 1000,
};

describe('connectionFolders', () => {
  it('keeps a Connection apart from v1, under connect-v2', () => {
    const own = connectionFolders('main', linux);
    expect(own.data).toBe(
      '/home/ada/.local/share/kestack/connect-v2/connections/main',
    );
    expect(own.state).toBe(
      '/home/ada/.local/state/kestack/connect-v2/connections/main',
    );
    expect(own.cache).toBe('/home/ada/.cache/kestack');
    expect(own.db).toBe(`${own.data}/ke-connect.db`);
    expect(own.plugins).toBe(`${own.data}/plugins`);
  });

  it('names every socket of a Connection in one short folder', () => {
    const own = connectionFolders('work', linux);
    expect(own.control).toMatch(
      /^\/run\/user\/1000\/kestack\/[a-f0-9]{8}\/connect\.sock$/,
    );
    expect(own.control.startsWith(own.sockets.prefix)).toBe(true);
  });

  it('gives named pipes on Windows', () => {
    const own = connectionFolders('main', {
      env: { LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local' },
      platform: 'win32',
      home: 'C:\\Users\\ada',
    });
    expect(own.control).toMatch(/^\\\\\.\\pipe\\kestack-[a-f0-9]{8}-connect$/);
    expect(own.socketFolder).toBeNull();
  });

  it('refuses a name that cannot be a folder', () => {
    expect(() => connectionFolders('Main', linux)).toThrow(
      /not a Connection name/,
    );
  });

  it('refuses a runtime folder too long for a socket', () => {
    expect(() =>
      connectionFolders('main', {
        ...linux,
        env: { XDG_RUNTIME_DIR: `/${'r'.repeat(90)}` },
      }),
    ).toThrow(/longer than 103 bytes/);
  });
});
