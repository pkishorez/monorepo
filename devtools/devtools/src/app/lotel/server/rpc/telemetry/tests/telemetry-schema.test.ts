import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { LogEntitySchema, SpanEntitySchema } from '../contract/index.js';

const run = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(effect);

describe('stored telemetry', () => {
  it('reads records written with and before the removed Flow fields', async () => {
    const [span, log, flowSpan] = await run(
      Effect.all([
        Schema.decodeUnknownEffect(SpanEntitySchema.schema)({
          _v: 'v1',
          traceId: 'legacy-trace',
          spanId: 'legacy-span',
          span: {},
          context: {},
        }),
        Schema.decodeUnknownEffect(LogEntitySchema.schema)({
          _v: 'v1',
          id: 'legacy-log',
          traceId: 'legacy-trace',
          spanId: 'legacy-span',
          log: {},
          context: {},
        }),
        Schema.decodeUnknownEffect(SpanEntitySchema.schema)({
          _v: 'v2',
          traceId: 'flow-trace',
          spanId: 'flow-span',
          flowId: 'flow-1',
          participantName: 'api',
          span: {},
          context: {},
        }),
      ]),
    );

    expect(span).toMatchObject({ traceId: 'legacy-trace' });
    expect(log).toMatchObject({ id: 'legacy-log' });
    expect(flowSpan).toMatchObject({ spanId: 'flow-span' });
    for (const record of [span, log, flowSpan]) {
      expect(record).not.toHaveProperty('flowId');
      expect(record).not.toHaveProperty('participantName');
    }
  });
});
