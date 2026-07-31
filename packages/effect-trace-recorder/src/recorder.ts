import { Effect, Exit, Logger, Option, References, Tracer } from 'effect';

import type {
  CapturedLog,
  CapturedSpan,
  CapturedTrace,
  TraceLogLevel,
  TraceValue,
} from './types.js';

const DEFAULT_MAX_SPANS = 2_000;

export interface TraceRecorderOptions {
  /**
   * Stop recording after this many spans. Guards against unbounded programs -
   * a loop wrapped in `Effect.withSpan` would otherwise exhaust memory.
   *
   * @default 2000
   */
  readonly maxSpans?: number;
  /** Called as each span ends, for consumers that stream spans while the program runs. */
  readonly onSpanEnd?: (span: CapturedSpan) => void;
  /** Called as each log is emitted, for consumers that stream logs while the program runs. */
  readonly onLog?: (log: CapturedLog) => void;
  /** Called once, when `maxSpans` is first exceeded. */
  readonly onTruncated?: (limit: number) => void;
  /**
   * Renders values that are not JSON-serialisable. Defaults to `String`.
   *
   * Exists so callers with a richer formatter (Vitest's `stringify`, say) keep
   * their output rather than inheriting this package's.
   */
  readonly formatValue?: (value: unknown) => string;
  /**
   * Throw from {@link TraceRecorder.snapshot} if any span is still running.
   *
   * Suits batch consumers - a test that finished with an open span recorded
   * something incoherent. Interactive consumers want the default `false`, where
   * unfinished spans are reported with `status: 'running'`.
   *
   * @default false
   */
  readonly requireFinishedSpans?: boolean;
}

export interface TraceRecorder {
  /**
   * Installs the recorder's tracer and logger onto an Effect. Spans and logs
   * produced anywhere inside it are recorded; nothing outside it is.
   */
  readonly instrument: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
  /** Everything recorded so far. Safe to call at any point, including mid-run. */
  readonly snapshot: () => CapturedTrace;
}

type NativeSpanOptions = ConstructorParameters<typeof Tracer.NativeSpan>[0];

class RecordedSpan extends Tracer.NativeSpan {
  readonly #onEnd: (span: RecordedSpan) => void;

  constructor(options: NativeSpanOptions, onEnd: (span: RecordedSpan) => void) {
    super(options);
    this.#onEnd = onEnd;
  }

  override end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    super.end(endTime, exit);
    this.#onEnd(this);
  }
}

export function makeTraceRecorder(
  options: TraceRecorderOptions = {},
): TraceRecorder {
  const {
    maxSpans = DEFAULT_MAX_SPANS,
    onSpanEnd,
    onLog,
    onTruncated,
    formatValue = String,
    requireFinishedSpans = false,
  } = options;

  const spans: Tracer.NativeSpan[] = [];
  const logs: CapturedLog[] = [];
  let truncated = false;

  const toValue = (value: unknown): TraceValue =>
    traceValue(value, formatValue);

  const tracer = Tracer.make({
    span(spanOptions) {
      if (spans.length >= maxSpans) {
        if (!truncated) {
          truncated = true;
          onTruncated?.(maxSpans);
        }
        // Still a real span, so children nest correctly - it is just not recorded.
        return new Tracer.NativeSpan(spanOptions);
      }
      const span = new RecordedSpan(spanOptions, (ended) => {
        onSpanEnd?.(normalizeSpan(ended, toValue));
      });
      spans.push(span);
      return span;
    },
  });

  const logger = Logger.make<unknown, void>((logOptions) => {
    const level = logLevel(logOptions.logLevel);
    if (level === null) return;
    const log: CapturedLog = {
      spanId: logOptions.fiber.currentSpan?.spanId ?? null,
      timestamp: logOptions.date.getTime(),
      level,
      message: toValue(
        Array.isArray(logOptions.message) && logOptions.message.length === 1
          ? logOptions.message[0]
          : logOptions.message,
      ),
      annotations: Object.fromEntries(
        Object.entries(
          logOptions.fiber.getRef(References.CurrentLogAnnotations),
        ).map(([key, value]) => [key, toValue(value)]),
      ),
    };
    logs.push(log);
    onLog?.(log);
  });

  return {
    instrument: (effect) =>
      effect.pipe(
        Effect.withTracer(tracer),
        Effect.provide(Logger.layer([logger])),
      ),
    snapshot: () => {
      if (requireFinishedSpans) {
        for (const span of spans) {
          if (span.status._tag === 'Started') {
            throw namedError(
              'IncompleteTrace',
              `Span "${span.name}" did not finish inside the recorded Effect`,
            );
          }
        }
      }
      const normalized = sortSpans(
        spans.map((span) => normalizeSpan(span, toValue)),
      );
      const recordedIds = new Set(normalized.map(({ spanId }) => spanId));
      return {
        spans: normalized,
        logs: logs
          .map((log) => ({
            ...log,
            spanId:
              log.spanId !== null && recordedIds.has(log.spanId)
                ? log.spanId
                : null,
          }))
          .sort((left, right) => left.timestamp - right.timestamp),
        truncated,
      };
    },
  };
}

function logLevel(level: string): TraceLogLevel | null {
  switch (level) {
    case 'Fatal':
    case 'Error':
    case 'Warn':
    case 'Info':
    case 'Debug':
    case 'Trace':
      return level;
    default:
      return null;
  }
}

function normalizeSpan(
  span: Tracer.NativeSpan,
  toValue: (value: unknown) => TraceValue,
): CapturedSpan {
  const status = span.status;
  const running = status._tag === 'Started';
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: Option.match(span.parent, {
      onNone: () => null,
      onSome: (parent) => parent.spanId,
    }),
    name: span.name,
    startTime: nanosToMillis(status.startTime),
    endTime: running ? null : nanosToMillis(status.endTime),
    status: running
      ? 'running'
      : Exit.isSuccess(status.exit)
        ? 'success'
        : 'error',
    attributes: Object.fromEntries(
      [...span.attributes].map(([key, value]) => [key, toValue(value)]),
    ),
    events: span.events.map(([name, timestamp, attributes]) => ({
      name,
      timestamp: nanosToMillis(timestamp),
      attributes: Object.fromEntries(
        Object.entries(attributes).map(([key, value]) => [key, toValue(value)]),
      ),
    })),
  };
}

function nanosToMillis(nanos: bigint): number {
  return Number(nanos) / 1_000_000;
}

/**
 * Orders spans parent-first, siblings by start time. Spans whose parent was not
 * recorded (a truncated or out-of-scope parent) are treated as roots.
 */
function sortSpans(spans: readonly CapturedSpan[]): CapturedSpan[] {
  const byId = new Map(spans.map((span) => [span.spanId, span]));
  const children = new Map<string | null, CapturedSpan[]>();
  for (const span of spans) {
    const parent = span.parentSpanId;
    const group = parent !== null && byId.has(parent) ? parent : null;
    children.set(group, [...(children.get(group) ?? []), span]);
  }
  const compare = (left: CapturedSpan, right: CapturedSpan) =>
    left.startTime - right.startTime || left.spanId.localeCompare(right.spanId);
  const ordered: CapturedSpan[] = [];
  const seen = new Set<string>();
  const visit = (span: CapturedSpan): void => {
    if (seen.has(span.spanId)) return;
    seen.add(span.spanId);
    ordered.push(span);
    for (const child of (children.get(span.spanId) ?? []).sort(compare)) {
      visit(child);
    }
  };
  for (const root of (children.get(null) ?? []).sort(compare)) visit(root);
  for (const span of [...spans].sort(compare)) visit(span);
  return ordered;
}

function traceValue(
  value: unknown,
  formatValue: (value: unknown) => string,
): TraceValue {
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) return JSON.parse(serialized) as TraceValue;
  } catch {}
  return formatValue(value);
}

function namedError(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}
