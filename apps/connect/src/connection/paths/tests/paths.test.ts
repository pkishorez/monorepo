import { describe, expect, it } from 'vitest';
import { resolvePaths } from '../paths.js';

const home = '/home/ada';

describe('resolvePaths on macOS and Linux', () => {
  it('uses the XDG defaults under kestack', () => {
    const paths = resolvePaths({ env: {}, platform: 'linux', home });
    expect(paths).toEqual({
      config: '/home/ada/.config/kestack/connect',
      data: '/home/ada/.local/share/kestack/connect',
      state: '/home/ada/.local/state/kestack/connect',
      cache: '/home/ada/.cache/kestack/connect',
      db: '/home/ada/.local/share/kestack/connect/connect.db',
      attachments: '/home/ada/.local/share/kestack/connect/attachments',
      connection: '/home/ada/.local/share/kestack/connect/connection.json',
      log: '/home/ada/.local/state/kestack/connect/ke-connect.log',
      dev: '/home/ada/.local/state/kestack/connect/dev',
      cloudflared: '/home/ada/.cache/kestack/connect/bin/cloudflared',
      ai: {
        models: '/home/ada/.cache/kestack/connect/ai/models.json',
        speech: '/home/ada/.cache/kestack/connect/ai/speech-to-text',
      },
    });
  });

  it('follows each XDG variable', () => {
    const paths = resolvePaths({
      env: {
        XDG_CONFIG_HOME: '/x/config',
        XDG_DATA_HOME: '/x/data',
        XDG_STATE_HOME: '/x/state',
        XDG_CACHE_HOME: '/x/cache',
      },
      platform: 'darwin',
      home,
    });
    expect(paths.config).toBe('/x/config/kestack/connect');
    expect(paths.data).toBe('/x/data/kestack/connect');
    expect(paths.state).toBe('/x/state/kestack/connect');
    expect(paths.cache).toBe('/x/cache/kestack/connect');
  });

  it('ignores a relative XDG value, as the XDG spec does', () => {
    const paths = resolvePaths({
      env: { XDG_DATA_HOME: 'relative/data', XDG_CACHE_HOME: '' },
      platform: 'linux',
      home,
    });
    expect(paths.data).toBe('/home/ada/.local/share/kestack/connect');
    expect(paths.cache).toBe('/home/ada/.cache/kestack/connect');
  });
});

describe('resolvePaths on Windows', () => {
  it('uses APPDATA for config and LOCALAPPDATA for the rest', () => {
    const paths = resolvePaths({
      env: {
        APPDATA: 'C:\\Users\\ada\\AppData\\Roaming',
        LOCALAPPDATA: 'D:\\Local',
      },
      platform: 'win32',
      home: 'C:\\Users\\ada',
    });
    expect(paths.config).toBe(
      'C:\\Users\\ada\\AppData\\Roaming\\kestack\\connect',
    );
    expect(paths.data).toBe('D:\\Local\\kestack\\connect');
    expect(paths.state).toBe('D:\\Local\\kestack\\state\\connect');
    expect(paths.cache).toBe('D:\\Local\\kestack\\cache\\connect');
    expect(paths.cloudflared).toBe(
      'D:\\Local\\kestack\\cache\\connect\\bin\\cloudflared.exe',
    );
  });

  it('falls back to the default folders when a variable is missing', () => {
    const paths = resolvePaths({
      env: {},
      platform: 'win32',
      home: 'C:\\Users\\ada',
    });
    expect(paths.config).toBe(
      'C:\\Users\\ada\\AppData\\Roaming\\kestack\\connect',
    );
    expect(paths.data).toBe('C:\\Users\\ada\\AppData\\Local\\kestack\\connect');
  });
});

describe('resolvePaths for a branch', () => {
  it('puts data and state under .branches, and shares config and cache', () => {
    const main = resolvePaths({ env: {}, platform: 'linux', home });
    const paths = resolvePaths({
      branch: 'feat-x',
      env: {},
      platform: 'linux',
      home,
    });
    expect(paths.data).toBe(
      '/home/ada/.local/share/kestack/.branches/feat-x/connect',
    );
    expect(paths.state).toBe(
      '/home/ada/.local/state/kestack/.branches/feat-x/connect',
    );
    expect(paths.db).toBe(
      '/home/ada/.local/share/kestack/.branches/feat-x/connect/connect.db',
    );
    expect(paths.dev).toBe(
      '/home/ada/.local/state/kestack/.branches/feat-x/connect/dev',
    );
    expect(paths.config).toBe(main.config);
    expect(paths.cache).toBe(main.cache);
    expect(paths.ai).toEqual(main.ai);
  });

  it('rejects a branch that is not a host label', () => {
    for (const branch of ['', 'Main', '-x', 'a/b', '../up', 'a'.repeat(64)]) {
      expect(() =>
        resolvePaths({ branch, env: {}, platform: 'linux', home }),
      ).toThrow('is not a branch name');
    }
    expect(() =>
      resolvePaths({
        branch: 'a'.repeat(63),
        env: {},
        platform: 'linux',
        home,
      }),
    ).not.toThrow();
  });
});
