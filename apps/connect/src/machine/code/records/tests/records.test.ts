import { Effect, Schema } from 'effect';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';
import { describe, expect, it } from 'vitest';
import { HarnessAccountSchema, SessionSchema } from '../index.js';

/* Rows the previous release stored read as the records they are now. */

describe('stored records', () => {
  it('upgrade from every version', async () => {
    await expectUpgradable(SessionSchema);
    await expectUpgradable(HarnessAccountSchema);
  });

  it('read a v1 Session as running its harness’s Default Account', async () => {
    const session = await Effect.runPromise(
      Schema.decodeUnknownEffect(SessionSchema.schema)({
        _v: 'v1',
        id: 's1',
        projectId: 'p1',
        harness: 'codex',
        model: 'gpt-5',
        settings: {},
        title: 'Hi',
        status: 'idle',
        nativeId: null,
        createdAt: 1,
        forkedFrom: null,
        settledAt: null,
        activeAt: 1,
        endedAt: null,
      }),
    );
    expect(session.account).toBe('codex');
  });

  it('read a v1 Harness Binary as its harness’s Default Account', async () => {
    const account = await Effect.runPromise(
      Schema.decodeUnknownEffect(HarnessAccountSchema.schema)({
        _v: 'v1',
        id: 'claude',
        harness: 'claude',
        binaryPath: '/opt/claude',
        updatedAt: 1,
      }),
    );
    expect(account).toEqual({
      id: 'claude',
      harness: 'claude',
      name: 'Claude',
      binaryPath: '/opt/claude',
      home: null,
      updatedAt: 1,
    });
  });
});
