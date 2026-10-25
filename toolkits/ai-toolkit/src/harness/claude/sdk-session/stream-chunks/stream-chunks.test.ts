import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHUNK_MAX_WAIT_MS, type RawOut } from '../../../contract/index.js';
import { makeStreamChunks, POINTER, restore } from './index.js';

type Obj = Record<string, unknown>;

/**
 * The stream_event and assistant records of a real turn: two API messages,
 * the first with thinking, text and an Agent tool call, the second with
 * thinking and text. `at` is ms since the turn started.
 */
const recorded = JSON.parse(
  readFileSync(
    new URL('./fixtures/two-messages.json', import.meta.url),
    'utf8',
  ),
) as ReadonlyArray<{ readonly at: number; readonly message: Obj }>;

/**
 * Replays records the way the session does: each whole record as sent and
 * as stored, with the chunks sent since the one before it.
 */
const replay = (records: ReadonlyArray<{ at: number; message: Obj }>) => {
  const chunks = makeStreamChunks();
  const wholes: Array<{
    readonly sent: Obj;
    readonly stored: Obj;
    readonly chunks: ReadonlyArray<RawOut>;
  }> = [];
  let since: RawOut[] = [];
  for (const { at, message } of records) {
    if (message['type'] === 'stream_event') {
      since.push(...chunks.event(message, at), ...chunks.due(at));
    } else {
      const whole = chunks.whole(message);
      since.push(...whole.chunks);
      wholes.push({ sent: message, stored: whole.record, chunks: since });
      since = [];
    }
  }
  return { wholes, after: [...since, ...chunks.closeAll()] };
};

const contentOf = (record: Obj) =>
  (
    record['message'] as {
      content: Array<{ type: string; text?: unknown; thinking?: unknown }>;
    }
  ).content[0];

const messageId = (record: Obj): string =>
  (record['message'] as { id: string }).id;

const payloadOf = (out: RawOut) =>
  out.payload as { streamId: string; channel: string; text: string };

const byStreamId = (outs: ReadonlyArray<RawOut>) => {
  const map = new Map<string, string[]>();
  for (const { streamId, text } of outs.map(payloadOf)) {
    map.set(streamId, [...(map.get(streamId) ?? []), text]);
  }
  return map;
};

describe('stream chunks, on a captured turn', () => {
  const { wholes, after } = replay(recorded);
  const texts = wholes.filter((w) => contentOf(w.sent)?.type === 'text');

  it('sends a text block, all of it, as chunks before its whole record', () => {
    expect(texts).toHaveLength(2);
    for (const { sent, chunks } of texts) {
      const payloads = chunks.map(payloadOf);
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.map((p) => p.text).join('')).toBe(contentOf(sent)?.text);
      // Thinking is block 0 in both messages, so the text is block 1.
      expect(new Set(payloads.map((p) => p.streamId))).toEqual(
        new Set([`${messageId(sent)}:1`]),
      );
      expect(payloads.every((p) => p.channel === 'text')).toBe(true);
    }
    expect(after).toEqual([]);
  });

  it('stores a streamed text block as a pointer to its chunks', () => {
    for (const { sent, stored } of texts) {
      expect(contentOf(stored)).toEqual({
        type: 'text',
        text: { [POINTER]: `${messageId(sent)}:1` },
      });
      expect({ ...stored, message: null }).toEqual({ ...sent, message: null });
    }
  });

  it('restores every stored record to exactly what was sent', () => {
    const all = byStreamId(wholes.flatMap((w) => w.chunks));
    for (const { sent, stored } of wholes) {
      expect(restore(stored, all)).toEqual(sent);
    }
  });

  it('cuts a long block into several chunks of whole sentences', () => {
    const long = texts.find(
      (w) => String(contentOf(w.sent)?.text ?? '').length > 600,
    );
    const payloads = long?.chunks.map(payloadOf) ?? [];
    expect(payloads.length).toBeGreaterThan(1);
    for (const chunk of payloads.slice(0, -1)) {
      expect(chunk.text.trimEnd()).toMatch(/[.!?]$/);
    }
  });

  it('keeps a tool call, and redacted (empty) thinking, inline', () => {
    const inline = wholes.filter((w) => contentOf(w.sent)?.type !== 'text');
    expect(inline.map((w) => contentOf(w.sent)?.type)).toEqual([
      'thinking',
      'tool_use',
      'thinking',
    ]);
    for (const { sent, stored, chunks } of inline) {
      expect(stored).toEqual(sent);
      expect(chunks).toEqual([]);
    }
  });
});

const event = (event: Obj, parent: string | null = null): Obj => ({
  type: 'stream_event',
  event,
  parent_tool_use_id: parent,
});

const start = (parent: string | null = null) => [
  event({ type: 'message_start', message: { id: 'msg_1' } }, parent),
  event(
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '' },
    },
    parent,
  ),
];

const delta = (thinking: string, parent: string | null = null) =>
  event(
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking },
    },
    parent,
  );

describe('stream chunks, timing and agents', () => {
  it('sends short text once it has waited long enough', () => {
    const chunks = makeStreamChunks();
    for (const record of start()) chunks.event(record, 0);
    expect(chunks.event(delta('Hmm, let me'), 100)).toEqual([]);
    expect(chunks.nextDue()).toBe(CHUNK_MAX_WAIT_MS);
    expect(chunks.due(CHUNK_MAX_WAIT_MS - 1)).toEqual([]);
    expect(chunks.due(CHUNK_MAX_WAIT_MS)).toEqual([
      {
        kind: 'text.chunk',
        payload: {
          streamId: 'msg_1:0',
          channel: 'reasoning',
          text: 'Hmm, let me',
        },
      },
    ]);
    expect(chunks.nextDue()).toBeUndefined();
    chunks.event(delta(' think.'), CHUNK_MAX_WAIT_MS + 10);
    expect(chunks.nextDue()).toBe(2 * CHUNK_MAX_WAIT_MS);
  });

  it("gives a subagent's chunks its spawning tool call id", () => {
    const chunks = makeStreamChunks();
    for (const record of start('toolu_1')) chunks.event(record, 0);
    chunks.event(delta('Reading the file.', 'toolu_1'), 0);
    const outs = chunks.event(
      event({ type: 'content_block_stop', index: 0 }, 'toolu_1'),
      0,
    );
    expect(outs).toEqual([
      {
        kind: 'text.chunk',
        payload: {
          streamId: 'msg_1:0',
          channel: 'reasoning',
          text: 'Reading the file.',
        },
        agentId: 'toolu_1',
      },
    ]);
  });

  it('sends the text still waiting when the turn ends', () => {
    const chunks = makeStreamChunks();
    for (const record of start()) chunks.event(record, 0);
    chunks.event(delta('Cut off mid'), 0);
    expect(chunks.closeAll().map(payloadOf)).toEqual([
      { streamId: 'msg_1:0', channel: 'reasoning', text: 'Cut off mid' },
    ]);
    expect(chunks.closeAll()).toEqual([]);
  });

  it('flushes waiting text at a turn end and still points a later whole at it', () => {
    const chunks = makeStreamChunks();
    for (const record of start('toolu_1')) chunks.event(record, 0);
    chunks.event(delta('Still ', 'toolu_1'), 0);
    const flushed = chunks.flushAll();
    expect(flushed.map((o) => payloadOf(o).text)).toEqual(['Still ']);
    const later = chunks.event(delta('going.', 'toolu_1'), 0);
    const sent = {
      type: 'assistant',
      parent_tool_use_id: 'toolu_1',
      message: {
        id: 'msg_1',
        content: [{ type: 'thinking', thinking: 'Still going.' }],
      },
    };
    const whole = chunks.whole(sent);
    expect(contentOf(whole.record)?.thinking).toEqual({ [POINTER]: 'msg_1:0' });
    expect(
      restore(
        whole.record,
        byStreamId([...flushed, ...later, ...whole.chunks]),
      ),
    ).toEqual(sent);
  });

  it("closes only the whole record's own agent's blocks", () => {
    const chunks = makeStreamChunks();
    for (const record of [...start(), ...start('toolu_1')]) {
      chunks.event(record, 0);
    }
    chunks.event(delta('Main.'), 0);
    chunks.event(delta('Sub.', 'toolu_1'), 0);
    const sent = chunks.whole({
      type: 'assistant',
      parent_tool_use_id: 'toolu_1',
    }).chunks;
    expect(sent.map((o) => o.agentId)).toEqual(['toolu_1']);
    expect(chunks.closeAll().map((o) => payloadOf(o).text)).toEqual(['Main.']);
  });

  it('points a thinking block at its chunks and keeps its signature', () => {
    const chunks = makeStreamChunks();
    for (const record of start()) chunks.event(record, 0);
    chunks.event(delta('Let me look.'), 0);
    const block = {
      type: 'thinking',
      thinking: 'Let me look.',
      signature: 'sig',
    };
    const sent = {
      type: 'assistant',
      message: { id: 'msg_1', content: [block] },
    };
    const whole = chunks.whole(sent);
    expect(whole.record).toEqual({
      ...sent,
      message: {
        id: 'msg_1',
        content: [{ ...block, thinking: { [POINTER]: 'msg_1:0' } }],
      },
    });
    expect(restore(whole.record, byStreamId(whole.chunks))).toEqual(sent);
  });

  it('keeps text inline when its chunks do not add up to it', () => {
    const chunks = makeStreamChunks();
    for (const record of start()) chunks.event(record, 0);
    chunks.event(delta('Let me'), 0);
    const sent = {
      type: 'assistant',
      message: {
        id: 'msg_1',
        content: [{ type: 'thinking', thinking: 'Let me look.' }],
      },
    };
    expect(chunks.whole(sent).record).toEqual(sent);
  });
});
