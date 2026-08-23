import { Cause, Exit, Option, Tracer } from 'effect';
import { OtlpResource } from 'effect/unstable/observability';
import type { RequestQueue } from './request-queue.js';
import { nextSequence, sequenceAttribute } from '../../sequence/index.js';

type NativeSpanOptions = ConstructorParameters<typeof Tracer.NativeSpan>[0];

interface SpanExporterOptions {
  readonly queue: RequestQueue;
  readonly url: string;
  readonly resource: OtlpResource.Resource;
  readonly scope: { readonly name: string };
}

const spanKind = {
  unspecified: 0,
  internal: 1,
  server: 2,
  client: 3,
  producer: 4,
  consumer: 5,
} as const;

const spanKey = (span: Tracer.NativeSpan) => `${span.traceId}:${span.spanId}`;

const spanRecord = (span: Tracer.NativeSpan) => {
  const spanStatus = span.status;
  const ended = spanStatus._tag === 'Ended';
  const attributes = OtlpResource.entriesToAttributes(
    span.attributes.entries(),
  );
  const events = ended
    ? span.events.map(([name, time, eventAttributes]) => ({
        name,
        timeUnixNano: String(time),
        attributes: OtlpResource.entriesToAttributes(
          Object.entries(eventAttributes),
        ),
      }))
    : [];

  let status = { code: 0 };
  if (spanStatus._tag === 'Ended') {
    status = {
      code:
        Exit.isSuccess(spanStatus.exit) ||
        Cause.hasInterruptsOnly(spanStatus.exit.cause)
          ? 1
          : 2,
    };
  }

  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: Option.match(span.parent, {
      onNone: () => undefined,
      onSome: (parent) => parent.spanId,
    }),
    name: span.name,
    kind: spanKind[span.kind],
    startTimeUnixNano: String(span.startTime),
    ...(spanStatus._tag === 'Ended'
      ? { endTimeUnixNano: String(spanStatus.endTime) }
      : {}),
    attributes,
    events,
    status,
    links: span.links.map((link) => ({
      traceId: link.span.traceId,
      spanId: link.span.spanId,
      attributes: OtlpResource.entriesToAttributes(
        Object.entries(link.attributes),
      ),
    })),
  };
};

const traceRequest = (
  span: Tracer.NativeSpan,
  options: SpanExporterOptions,
) => ({
  url: options.url,
  body: {
    resourceSpans: [
      {
        resource: options.resource,
        scopeSpans: [{ scope: options.scope, spans: [spanRecord(span)] }],
      },
    ],
  },
});

class ExportedSpan extends Tracer.NativeSpan {
  readonly #options: SpanExporterOptions;

  constructor(options: NativeSpanOptions, exporter: SpanExporterOptions) {
    super(options);
    this.#options = exporter;
    this.attribute(sequenceAttribute, nextSequence());
    if (this.sampled) {
      exporter.queue.offerProvisionalSpan(
        spanKey(this),
        traceRequest(this, exporter),
      );
    }
  }

  override end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    super.end(endTime, exit);
    if (this.sampled) {
      this.#options.queue.offerCompletedSpan(
        spanKey(this),
        traceRequest(this, this.#options),
      );
    }
  }
}

/** Creates the Effect tracer that exports provisional and completed spans. */
export const makeTracer = (options: SpanExporterOptions) =>
  Tracer.make({
    span: (spanOptions) => new ExportedSpan(spanOptions, options),
  });
