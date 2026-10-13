import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { makeSqliteTelemetryStore } from './sqlite/sqlite.js';

const run = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(effect);

describe('sqlite telemetry store', () => {
  it('returns all Span Records when a read has no limit', async () => {
    const records = Array.from({ length: 101 }, (_, index) => ({
      traceId: 'large-trace',
      spanId: `span-${String(index).padStart(3, '0')}`,
      span: {},
      context: {},
    }));

    const result = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeSqliteTelemetryStore(':memory:');
          const saved = yield* store.saveSpans(records);
          const byTrace = yield* store.findSpansByTrace('large-trace');
          const listed = yield* store.listSpans({ '>': null });
          return { saved, byTrace, listed };
        }),
      ),
    );

    expect(result.saved).toEqual({ accepted: 101, rejected: 0 });
    expect(result.byTrace).toHaveLength(101);
    expect(result.listed.items).toHaveLength(101);
  });
});
