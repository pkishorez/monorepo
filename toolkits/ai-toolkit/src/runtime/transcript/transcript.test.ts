import { Effect, Fiber, Layer } from 'effect';
import { defaultBroadcaster } from 'std-toolkit/core';
import { Memory } from 'std-toolkit/db/memory';
import { describe, expect, it } from 'vitest';
import { FLUSH_MIN_CHARS } from '../constants.js';
import { claude, common } from '../protocol/index.js';
import { aiTable, messages } from '../table/index.js';
import { makeTranscript } from './transcript.js';

const COMMON_PARTS = common.parts;
const CLAUDE_PARTS = claude.parts;
const customPart = common.customPart;
const storage = Layer.merge(Memory.make(aiTable).layer, defaultBroadcaster);

const rowsOf = (threadId: string) =>
  messages
    .query('byThreadUpdate', { pk: { threadId }, '>=': null }, { limit: 50 })
    .pipe(Effect.map((page) => page.items.map((item) => item.value)));

describe('Transcript', () => {
  it('batches streamed text and persists each flush as one immutable row', async () => {
    const stored = await Effect.runPromise(
      Effect.gen(function* () {
        const transcript = yield* makeTranscript({
          threadId: 't1',
          runId: 'r1',
        });
        const drain = yield* Effect.forkChild(transcript.drain);
        transcript.writer.text('x'.repeat(FLUSH_MIN_CHARS));
        transcript.writer.text('tail');
        transcript.writer.toolCall({
          id: 'tool-1',
          name: 'Read',
          arguments: '{}',
          state: 'input-complete',
        });
        yield* transcript.close;
        yield* Fiber.join(drain);
        return yield* rowsOf('t1');
      }).pipe(Effect.provide(storage)),
    );

    expect(stored.map((row) => row.role)).toEqual(['assistant', 'assistant']);
    expect(stored[0]?.data.parts).toEqual([
      { type: 'text', content: 'x'.repeat(FLUSH_MIN_CHARS) },
    ]);
    expect(stored[1]?.data.parts).toMatchObject([
      { type: 'text', content: 'tail' },
      { type: 'tool-call', id: 'tool-1' },
    ]);
    expect(stored.map((row) => row.id)).toEqual(['r1:000001', 'r1:000002']);
  });

  it('holds short text back and flushes boundaries at once by role', async () => {
    const stored = await Effect.runPromise(
      Effect.gen(function* () {
        const transcript = yield* makeTranscript({
          threadId: 't2',
          runId: 'r2',
        });
        const drain = yield* Effect.forkChild(transcript.drain);
        transcript.writer.text('short');
        transcript.writer.part(
          customPart(COMMON_PARTS.QUESTION, {
            requestId: 'q1',
            questions: [{ id: '0', prompt: 'Which?' }],
          }),
        );
        transcript.writer.resolution(
          customPart(CLAUDE_PARTS.PERMISSION_RESOLVED, {
            requestId: 'q1',
            answer: { behavior: 'allow' },
          }),
        );
        yield* transcript.close;
        yield* Fiber.join(drain);
        return yield* rowsOf('t2');
      }).pipe(Effect.provide(storage)),
    );

    expect(stored.map((row) => row.role)).toEqual(['assistant', 'user']);
    expect(stored[0]?.data.parts.map((part) => part.type)).toEqual([
      'text',
      'custom',
    ]);
  });
});
