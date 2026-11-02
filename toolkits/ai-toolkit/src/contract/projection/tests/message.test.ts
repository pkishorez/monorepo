import { Effect, Schema } from 'effect';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';
import { describe, expect, it } from 'vitest';
import { MessageSchema } from '../index.js';

/* Messages a device kept from an earlier version read as they are now. */

describe('MessageSchema', () => {
  it('upgrades from every version', async () => {
    await expectUpgradable(MessageSchema);
  });

  it('reads a v1 turnStarted as it was, and writes a Resumed one as the latest', async () => {
    const v1 = {
      _v: 'v1',
      id: 'm1',
      sessionId: 's1',
      turnId: 't1',
      agentId: null,
      role: 'user',
      parts: [{ type: 'turnStarted', text: 'hi', steered: false }],
      at: 1,
    };
    const read = await Effect.runPromise(
      Schema.decodeUnknownEffect(MessageSchema.schema)(v1),
    );
    expect(read.parts).toEqual([
      { type: 'turnStarted', text: 'hi', steered: false },
    ]);
    const written = await Effect.runPromise(
      Schema.encodeEffect(MessageSchema.schema)({
        ...read,
        parts: [
          { type: 'turnStarted', text: 'go on', steered: false, resumed: true },
        ],
      }),
    );
    expect(written).toMatchObject({
      _v: 'v3',
      parts: [{ type: 'turnStarted', resumed: true }],
    });
  });

  it("reads a v2 Message as it was, and writes a Background Job's end as v3", async () => {
    const v2 = {
      _v: 'v2',
      id: 'm1',
      sessionId: 's1',
      turnId: 't1',
      agentId: null,
      role: 'user',
      parts: [
        { type: 'turnStarted', text: 'go on', steered: false, resumed: true },
      ],
      at: 1,
    };
    const read = await Effect.runPromise(
      Schema.decodeUnknownEffect(MessageSchema.schema)(v2),
    );
    expect(read.parts).toEqual(v2.parts);
    const written = await Effect.runPromise(
      Schema.encodeEffect(MessageSchema.schema)({
        ...read,
        parts: [
          { type: 'jobEnded', jobId: 'a1', status: 'done', summary: 'Done' },
        ],
      }),
    );
    expect(written).toMatchObject({ _v: 'v3', parts: [{ type: 'jobEnded' }] });
  });
});
