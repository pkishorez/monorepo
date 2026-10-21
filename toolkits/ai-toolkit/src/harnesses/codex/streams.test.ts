import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_MAX_WAIT_MS, type RawOut } from '../../harness/index.js';
import type { ThreadItem } from './app-server/index.js';
import { makeStreams, restore, type TextChunk } from './streams.js';

const message = (itemId: string, delta: string, threadId = 'main') => ({
  method: 'item/agentMessage/delta',
  params: { threadId, turnId: 't', itemId, delta },
});

const summary = (itemId: string, summaryIndex: number, delta: string) => ({
  method: 'item/reasoning/summaryTextDelta',
  params: { threadId: 'main', turnId: 't', itemId, delta, summaryIndex },
});

const agentMessage = (id: string, text: string): ThreadItem => ({
  type: 'agentMessage',
  id,
  text,
  phase: 'final_answer',
});

const reasoning = (id: string, summary: ReadonlyArray<string>): ThreadItem => ({
  type: 'reasoning',
  id,
  summary,
  content: [],
});

const sentence = (n: number) =>
  `Sentence ${n} has some words in it to fill the space. `;

/** Each stream's chunk texts, as a reader of Raw would gather them. */
const byStream = (outs: ReadonlyArray<RawOut>) => {
  const chunks: Record<string, Array<string>> = {};
  for (const out of outs) {
    if (out.kind !== 'text.chunk') continue;
    const { streamId, text } = out.payload as unknown as TextChunk;
    (chunks[streamId] ??= []).push(text);
  }
  return chunks;
};

describe('Streams', () => {
  let outs: RawOut[];
  let streams: ReturnType<typeof makeStreams>;
  beforeEach(() => {
    vi.useFakeTimers();
    outs = [];
    streams = makeStreams((out) => outs.push(out));
  });
  afterEach(() => {
    streams.close();
    vi.useRealTimers();
  });

  const texts = () => outs.map((out) => (out.payload as { text: string }).text);

  it('cuts chunks of a few sentences and stores the text as a pointer', () => {
    const text = Array.from({ length: 12 }, (_, n) => sentence(n)).join('');
    for (const char of text) streams.delta(message('m', char), undefined);
    expect(outs.length).toBeGreaterThan(1);
    const item = agentMessage('m', text);
    const stored = streams.complete(item);
    expect(texts().join('')).toBe(text);
    expect(stored).toEqual({ ...item, text: { $stream: 'm' } });
    expect(restore(stored, byStream(outs))).toEqual(item);
    expect(outs[0]).toEqual({
      kind: 'text.chunk',
      payload: { streamId: 'm', channel: 'text', text: texts()[0] },
    });
  });

  it('sends short text once it has waited long enough', () => {
    streams.delta(message('m', 'A short start.'), undefined);
    vi.advanceTimersByTime(CHUNK_MAX_WAIT_MS - 1);
    expect(outs).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(texts()).toEqual(['A short start.']);
    streams.delta(message('m', ' More.'), undefined);
    streams.complete(agentMessage('m', 'A short start. More.'));
    expect(texts()).toEqual(['A short start.', ' More.']);
    vi.advanceTimersByTime(CHUNK_MAX_WAIT_MS);
    expect(outs).toHaveLength(2);
  });

  it('streams a sub-agent with its agentId and flushes it as its turn ends', () => {
    streams.delta(message('c', 'Child text.', 'child'), 'call-1');
    streams.delta(message('m', 'Main text.'), undefined);
    streams.endThread('child');
    expect(outs).toEqual([
      {
        kind: 'text.chunk',
        payload: { streamId: 'c', channel: 'text', text: 'Child text.' },
        agentId: 'call-1',
      },
    ]);
  });

  it('streams each reasoning part on its own, and restores them all', () => {
    streams.delta(summary('r', 0, 'First part.'), undefined);
    streams.delta(summary('r', 1, 'Second part.'), undefined);
    const item = reasoning('r', ['First part.', 'Second part.']);
    const stored = streams.complete(item);
    expect(stored).toEqual({
      ...item,
      summary: [{ $stream: 'r:summary:0' }, { $stream: 'r:summary:1' }],
    });
    expect(outs.map((out) => out.payload)).toEqual([
      { streamId: 'r:summary:0', channel: 'reasoning', text: 'First part.' },
      { streamId: 'r:summary:1', channel: 'reasoning', text: 'Second part.' },
    ]);
    expect(restore(stored, byStream(outs))).toEqual(item);
  });

  it('keeps text that never streamed inline, and sends a missing end', () => {
    const whole = agentMessage('whole', 'Never streamed.');
    expect(streams.complete(whole)).toEqual(whole);
    streams.delta(message('m', 'Begun'), undefined);
    const item = agentMessage('m', 'Begun and finished.');
    const stored = streams.complete(item);
    expect(texts()).toEqual(['Begun', ' and finished.']);
    expect(restore(stored, byStream(outs))).toEqual(item);
  });

  it('points a finished turn at the chunks of items it repeats', () => {
    streams.delta(message('m', 'Done.'), undefined);
    const item = agentMessage('m', 'Done.');
    streams.complete(item);
    expect(streams.stored(item)).toEqual({ ...item, text: { $stream: 'm' } });
    const other = agentMessage('other', 'Never streamed.');
    expect(streams.stored(other)).toEqual(other);
  });

  it('sends what waits in every stream when the turn ends', () => {
    streams.delta(message('a', 'One.'), undefined);
    streams.delta(message('b', 'Two.', 'child'), 'call-1');
    streams.flushAll();
    expect(texts()).toEqual(['One.', 'Two.']);
  });

  it('ignores other notifications', () => {
    expect(
      streams.delta({ method: 'turn/started', params: {} }, undefined),
    ).toBe(false);
  });
});

describe('restore', () => {
  it('leaves a pointer it has no chunks for, and plain values, as they are', () => {
    expect(
      restore({ a: { $stream: 'x' }, b: [1, 'two', null] }, { y: ['z'] }),
    ).toEqual({ a: { $stream: 'x' }, b: [1, 'two', null] });
  });
});
