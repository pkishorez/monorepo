import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { Effect, Layer } from 'effect';
import type { DecodedEntity } from 'std-toolkit/core';
import { defaultBroadcaster } from 'std-toolkit/core';
import type { QueryPage } from 'std-toolkit/db';
import { Memory } from 'std-toolkit/db/memory';
import { describe, expect, it } from 'vitest';
import { SYNC_PAGE_SIZE } from '../constants.js';
import {
  aiTable,
  MessageSchema,
  messages,
  type Message,
} from '../table/index.js';

const CHUNK_SIZES = [1, 10, 40, 100, 250, 500, 1_000, 2_000];
const STREAM = 'The quick brown fox jumps over the lazy dog. '
  .repeat(223)
  .slice(0, 10_000);
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const storage = Layer.merge(Memory.make(aiTable).layer, defaultBroadcaster);

const queryAll = (threadId: string) =>
  Effect.gen(function* () {
    const rows: DecodedEntity<Message>[] = [];
    let after: DecodedEntity<Message> | undefined;
    do {
      const page: QueryPage<DecodedEntity<Message>> = yield* messages.query(
        'byThreadUpdate',
        { pk: { threadId }, '>=': null },
        { limit: SYNC_PAGE_SIZE, ...(after === undefined ? {} : { after }) },
      );
      rows.push(...page.items);
      after = page.hasMore ? page.items.at(-1) : undefined;
      if (!page.hasMore) break;
    } while (after !== undefined);
    return rows;
  });

const clientRecord = (
  row: DecodedEntity<Message>,
  encoded: typeof MessageSchema.Encoded,
  sequence: number,
) => {
  const seq = String(sequence).padStart(32, '0');
  return {
    pk: `SyncStoredReplica#${MessageSchema.name}`,
    sk: row.value.id,
    _e: 'SyncStoredReplica',
    _v: 'v1',
    _u: row.meta._u,
    _d: false,
    data: {
      _v: 'v1',
      collection: MessageSchema.name,
      key: row.value.id,
      seq,
      entity: {
        value: encoded,
        meta: { ...row.meta, _s: 1_600_000_000_000, _c: 1_600_000_000_000 },
      },
    },
    LSI1SK: seq,
  };
};

describe('streaming delta storage', () => {
  it('measures record, transfer, and client persistence overhead by chunk size', async () => {
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const measurements = [];
        for (const chunkSize of CHUNK_SIZES) {
          const suffix = String(chunkSize).padStart(4, '0');
          const threadId = `thread-${suffix}`;
          const runId = `run-${suffix}`;
          const chunks = Array.from(
            { length: Math.ceil(STREAM.length / chunkSize) },
            (_, index) =>
              STREAM.slice(index * chunkSize, (index + 1) * chunkSize),
          );

          const writeStarted = performance.now();
          yield* Effect.forEach(
            chunks,
            (content, index) =>
              messages.insert({
                id: `${runId}:${String(index + 1).padStart(6, '0')}`,
                threadId,
                runId,
                role: 'assistant',
                createdAt: 1_600_000_000_000 + index,
                data: { parts: [{ type: 'text', content }], metadata: null },
              }),
            { concurrency: 100, discard: true },
          );
          const writeMs = performance.now() - writeStarted;

          const queryStarted = performance.now();
          const rows = yield* queryAll(threadId);
          const queryMs = performance.now() - queryStarted;
          const encoded = yield* Effect.forEach(rows, (row) =>
            MessageSchema.encode(row.value),
          );
          const stored = yield* Effect.forEach(rows, (row) =>
            messages
              .insertOp(row.value)
              .pipe(Effect.flatMap((op) => op.apply(null, row.meta._u))),
          );
          const rpcBytes = Array.from(
            { length: Math.ceil(rows.length / SYNC_PAGE_SIZE) },
            (_, index) =>
              bytes(
                rows
                  .slice(index * SYNC_PAGE_SIZE, (index + 1) * SYNC_PAGE_SIZE)
                  .map((row) => ({
                    ...row,
                    meta: { ...row.meta, _s: 1_600_000_000_000 },
                  })),
              ),
          ).reduce((total, size) => total + size, 0);
          const tableBytes = stored.reduce(
            (total, item) => total + bytes(item.write.item),
            0,
          );
          const idbBytes = rows.reduce(
            (total, row, index) =>
              total + bytes(clientRecord(row, encoded[index]!, index + 1)),
            0,
          );

          expect(
            rows
              .flatMap((row) => row.value.data.parts)
              .map((part) => (part.type === 'text' ? part.content : ''))
              .join(''),
          ).toBe(STREAM);

          measurements.push({
            chunk: chunkSize,
            rows: rows.length,
            pages: Math.ceil(rows.length / SYNC_PAGE_SIZE),
            tableKB: +(tableBytes / 1_000).toFixed(1),
            rpcKB: +(rpcBytes / 1_000).toFixed(1),
            idbKB: +(idbBytes / 1_000).toFixed(1),
            overhead: +((idbBytes / bytes(STREAM) - 1) * 100).toFixed(0),
            writeMs: +writeMs.toFixed(0),
            queryMs: +queryMs.toFixed(0),
          });
        }
        return measurements;
      }).pipe(Effect.provide(storage)),
    );

    console.table(results);
    expect(results.map(({ chunk, rows }) => [chunk, rows])).toEqual(
      CHUNK_SIZES.map((chunk) => [chunk, Math.ceil(STREAM.length / chunk)]),
    );
  }, 60_000);
});
