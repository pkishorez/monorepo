import { Effect, Exit, Layer, Option, SubscriptionRef, Tracer } from 'effect';
import { TimeInMillis, tracerSpanSchema } from './schema.js';
import type { TracerSpanSubscriptionValue } from '../types.js';

function bigintToMillis(bigint: bigint) {
  return TimeInMillis.make(Number(bigint / 10_00_000n));
}

export function createTracerWatcher({
  traceId = 'no-trace-id',
}: {
  traceId?: string;
} = {}) {
  let uid = 1;
  const { ref, add, update } = (() => {
    const spanMap = new Map<string, typeof tracerSpanSchema.Type>();

    let i = 0;
    const ref = Effect.runSync(
      SubscriptionRef.make<TracerSpanSubscriptionValue>({
        i: 0,
        value: [],
      }),
    );
    const updateRef = () => {
      Effect.runSync(
        ref.modify((v) => [v, { value: Array.from(spanMap.values()), i: ++i }]),
      );
    };

    return {
      ref,
      add: (key: string, span: typeof tracerSpanSchema.Type) => {
        spanMap.set(key, span);
        updateRef();
      },
      update: (
        key: string,
        updateFn: (
          value: typeof tracerSpanSchema.Type,
        ) => typeof tracerSpanSchema.Type,
      ) => {
        const existing = spanMap.get(key);
        if (!existing) {
          throw new Error(`Span with key ${key} does not exist`);
        }
        spanMap.set(key, updateFn(existing));
        updateRef();
      },
    };
  })();

  const TracerLayer = Layer.setTracer(
    Tracer.make({
      span(name, parent, context, links, spanStartTime, kind) {
        const spanId = `span:${uid++}`;

        add(spanId, {
          traceId,
          parentSpanId: parent.pipe(
            Option.map((v) => v.spanId),
            Option.getOrNull,
          ),
          spanId,

          name,
          startTime: bigintToMillis(spanStartTime),
          end: null,

          attributes: {},
          events: [],
        });

        return {
          _tag: 'Span',
          kind,
          links,
          context,
          name,
          sampled: false,
          spanId,
          traceId,
          attributes: new Map(),
          attribute: (key, value) => {
            update(spanId, (span) => ({
              ...span,
              attributes: {
                ...span.attributes,
                [key]: value,
              },
            }));
          },
          event: (name, startTime, attributes = {}) => {
            update(spanId, (span) => ({
              ...span,
              events: [
                ...span.events,
                {
                  name,
                  time: bigintToMillis(startTime),
                  attributes,
                },
              ],
            }));
          },
          end: (endTimeInBigint: bigint, exit: Exit.Exit<unknown, never>) => {
            update(spanId, (span) => ({
              ...span,
              end: {
                time: bigintToMillis(endTimeInBigint),
                exit,
              },
            }));
          },
          addLinks: () => {
            // TODO: How can we make use of this???
          },
          status: { _tag: 'Started', startTime: spanStartTime },
          parent,
        };
      },
      context: (fn) => fn(),
    }),
  );

  return {
    TracerLayer,
    ref,
  };
}
