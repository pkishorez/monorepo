import { describe, expect, it } from 'vitest';
import { configFolderOf } from '../config-folder.js';

/*
 * The config folder a Harness Account really uses: its own when it has
 * one; else the harness's variable in the environment it runs in; else
 * the harness's own folder under home.
 */

const home = '/home/me';

describe('the config folder used', () => {
  it("is the account's own folder first, whatever the environment says", () => {
    expect(
      configFolderOf(
        'claude',
        '/home/me/.claude-personal',
        { CLAUDE_CONFIG_DIR: '/home/me/.claude-work' },
        home,
      ),
    ).toEqual({ path: '/home/me/.claude-personal', from: 'account' });
  });

  it('is the variable set in the environment for an account with none', () => {
    expect(
      configFolderOf(
        'claude',
        undefined,
        { CLAUDE_CONFIG_DIR: '/home/me/.claude-work' },
        home,
      ),
    ).toEqual({
      path: '/home/me/.claude-work',
      from: 'environment',
      variable: 'CLAUDE_CONFIG_DIR',
    });
    expect(
      configFolderOf('codex', undefined, { CODEX_HOME: '/srv/codex' }, home),
    ).toEqual({
      path: '/srv/codex',
      from: 'environment',
      variable: 'CODEX_HOME',
    });
  });

  it("is the harness's own folder under home with neither", () => {
    expect(configFolderOf('claude', undefined, {}, home)).toEqual({
      path: '/home/me/.claude',
      from: 'default',
    });
    expect(
      configFolderOf('codex', undefined, { CODEX_HOME: '  ' }, home),
    ).toEqual({ path: '/home/me/.codex', from: 'default' });
  });

  it("reads another harness's variable as nothing", () => {
    expect(
      configFolderOf('codex', undefined, { CLAUDE_CONFIG_DIR: '/x' }, home),
    ).toEqual({ path: '/home/me/.codex', from: 'default' });
  });
});
