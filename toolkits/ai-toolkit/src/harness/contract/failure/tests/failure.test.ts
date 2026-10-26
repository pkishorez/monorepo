import { describe, expect, it } from 'vitest';
import { failureReason } from '../failure.js';

const claude = {
  harness: 'Claude Code',
  cwd: '/tmp',
  binary: '/usr/local/bin/no-such-claude',
};

const failed = (message: string, fields: Record<string, unknown> = {}) =>
  Object.assign(new Error(message), fields);

describe('failureReason', () => {
  it('names a project folder that no longer exists, whatever the harness said', () => {
    const launch = failed(
      "Claude Code native binary at /usr/local/bin/claude exists but failed to launch. This usually means the binary does not match this system's libc.",
      { code: 'ENOENT', errorClass: 'executable_launch_failed' },
    );
    expect(
      failureReason(launch, { ...claude, cwd: '/tmp/kestack-no-such-folder' }),
    ).toBe('The project folder /tmp/kestack-no-such-folder no longer exists');
  });

  it('names a Harness Binary that is missing, or that cannot run', () => {
    expect(
      failureReason(failed('spawn ENOENT', { code: 'ENOENT' }), claude),
    ).toBe('Claude Code was not found at /usr/local/bin/no-such-claude');
    expect(
      failureReason(failed('spawn codex ENOENT', { code: 'ENOENT' }), {
        ...claude,
        harness: 'Codex',
        binary: 'no-such-codex',
      }),
    ).toBe('Codex (no-such-codex) was not found on PATH');
    expect(
      failureReason(failed('spawn EACCES', { code: 'EACCES' }), claude),
    ).toBe(
      'Claude Code at /usr/local/bin/no-such-claude cannot be run: it is not executable',
    );
  });

  it('says a lost login or a rate limit plainly, with what the harness said', () => {
    expect(
      failureReason(
        failed(
          'Claude Code process exited with code 1. stderr: Invalid API key · Please run /login',
        ),
        claude,
      ),
    ).toBe('Claude Code is not logged in: Invalid API key · Please run /login');
    expect(
      failureReason(failed('429 Too Many Requests: slow down'), claude),
    ).toBe('Claude Code hit a rate limit: 429 Too Many Requests: slow down');
  });

  it("gives an exit's code and the last line of its stderr", () => {
    expect(
      failureReason(
        failed(
          'Claude Code process exited with code 2. stderr: starting\nError: bad flag --foo',
        ),
        claude,
      ),
    ).toBe('Claude Code stopped with exit code 2: Error: bad flag --foo');
    expect(
      failureReason(
        { exitCode: null, signal: 'SIGKILL', stderr: '' },
        { ...claude, harness: 'Codex' },
      ),
    ).toBe('Codex was stopped by SIGKILL');
  });

  it('falls back to what the harness said, cut to one line', () => {
    expect(failureReason(failed('Something odd\n happened'), claude)).toBe(
      'Something odd happened',
    );
    expect(failureReason(failed('x'.repeat(400)), claude)).toHaveLength(300);
    expect(failureReason(undefined, claude)).toBe(
      'Claude Code stopped without saying why',
    );
  });
});
