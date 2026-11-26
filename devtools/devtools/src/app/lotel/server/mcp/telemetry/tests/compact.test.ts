import { describe, expect, it } from 'vitest';
import { compactTrace, text } from '../real/compact.js';

const entity = <A>(value: A) => ({ value, meta: {} }) as never;

describe('compactTrace', () => {
  it('reads a span as one plain record: times from the Trace start, status, flat attributes and events', () => {
    const spans = [
      entity({
        traceId: 't',
        spanId: 'root',
        span: {
          name: 'GET /users',
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '1500000000',
          status: { code: 1 },
        },
        context: {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'api' } },
            ],
          },
        },
      }),
      entity({
        traceId: 't',
        spanId: 'db',
        span: {
          name: 'select users',
          parentSpanId: 'root',
          startTimeUnixNano: '1100000000',
          status: { code: 2, message: 'timeout' },
          attributes: [
            { key: 'db.rows', value: { intValue: '3' } },
            { key: 'db.cached', value: { boolValue: false } },
          ],
          events: [
            {
              name: 'exception',
              timeUnixNano: '1200000000',
              attributes: [
                { key: 'exception.message', value: { stringValue: 'boom' } },
              ],
            },
          ],
        },
        context: {},
      }),
    ];
    expect(compactTrace('t', spans, []).spans).toEqual([
      {
        span: 'root',
        parent: null,
        name: 'GET /users',
        service: 'api',
        startMs: 0,
        durationMs: 500,
        status: 'ok',
        attributes: {},
        events: [],
      },
      {
        span: 'db',
        parent: 'root',
        name: 'select users',
        service: null,
        startMs: 100,
        durationMs: null,
        status: 'error: timeout',
        attributes: { 'db.rows': '3', 'db.cached': 'false' },
        events: ['200ms exception exception.message=boom'],
      },
    ]);
  });
});

describe('text', () => {
  it('writes any OTLP value as text', () => {
    expect(
      text({
        arrayValue: { values: [{ stringValue: 'a' }, { doubleValue: 1.5 }] },
      }),
    ).toBe('[a, 1.5]');
    expect(
      text({
        kvlistValue: { values: [{ key: 'k', value: { intValue: 2 } }] },
      }),
    ).toBe('{"k":"2"}');
  });
});
