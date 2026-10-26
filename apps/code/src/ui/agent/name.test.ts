import { describe, expect, it } from 'vitest';
import { accountName, plainName } from './name.ts';

/*
 * A Harness Account is named by its agent's logo and its own name, the
 * agent's not said again, and the Default Account by its logo alone; in
 * plain text, by one word.
 */

describe('a Harness Account named', () => {
  it('is its logo alone for the Default Account, and the agent in plain text', () => {
    const named = {
      agent: 'claude',
      account: 'claude',
      name: 'Claude',
    } as const;
    expect(accountName(named)).toBeNull();
    expect(plainName(named)).toBe('Claude');
    expect(plainName({ agent: 'codex', account: 'codex', name: 'Codex' })).toBe(
      'Codex',
    );
  });

  it("is its own name after the logo, without the agent's", () => {
    expect(
      accountName({ agent: 'claude', account: 'a1', name: 'Claude Work' }),
    ).toBe('Work');
    expect(
      accountName({ agent: 'codex', account: 'a2', name: 'Personal' }),
    ).toBe('Personal');
  });

  it('is one word in plain text: Claude-Work, Codex-Work', () => {
    expect(
      plainName({ agent: 'claude', account: 'a1', name: 'Claude Work' }),
    ).toBe('Claude-Work');
    expect(plainName({ agent: 'codex', account: 'a2', name: 'Work' })).toBe(
      'Codex-Work',
    );
  });

  it('is named by its id while its name is not known', () => {
    expect(plainName({ agent: 'claude', account: 'a1', name: null })).toBe(
      'Claude-a1',
    );
  });
});
