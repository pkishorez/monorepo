import { Cause, Duration, Effect, Fiber, Queue } from 'effect';
import { HttpBody, HttpClient, HttpClientRequest } from 'effect/unstable/http';

export interface ExportRequest {
  readonly url: string;
  readonly body:
    | { readonly resourceSpans: readonly unknown[] }
    | { readonly resourceLogs: readonly unknown[] };
}

export interface RequestQueue {
  readonly offer: (request: ExportRequest) => void;
  readonly offerProvisionalSpan: (
    spanKey: string,
    request: ExportRequest,
  ) => void;
  readonly offerCompletedSpan: (
    spanKey: string,
    request: ExportRequest,
  ) => void;
}

interface RequestQueueOptions {
  readonly batchInterval: Duration.Input;
  readonly maxBatchSize: number;
  readonly retries: number;
  readonly requestTimeout: Duration.Input;
  readonly shutdownTimeout: Duration.Input;
}

/** Creates the ordered, batching transport used by development telemetry. */
export const makeRequestQueue = (options: RequestQueueOptions) =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ExportRequest, Cause.Done>();
    const pending = new Map<string | symbol, ExportRequest>();
    let closed = false;

    // OTLP permits multiple resource groups in one request. Preserve each
    // record's resource/scope metadata while combining requests by signal URL.
    const flush = () => {
      const batches = new Map<string, ExportRequest>();
      for (const request of pending.values()) {
        const previous = batches.get(request.url);
        const body =
          'resourceSpans' in request.body
            ? {
                resourceSpans: [
                  ...(previous && 'resourceSpans' in previous.body
                    ? previous.body.resourceSpans
                    : []),
                  ...request.body.resourceSpans,
                ],
              }
            : {
                resourceLogs: [
                  ...(previous && 'resourceLogs' in previous.body
                    ? previous.body.resourceLogs
                    : []),
                  ...request.body.resourceLogs,
                ],
              };
        batches.set(request.url, { url: request.url, body });
      }
      pending.clear();
      for (const batch of batches.values()) Queue.offerUnsafe(queue, batch);
    };
    const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient).pipe(
      HttpClient.retryTransient({ times: options.retries }),
    );

    const send = ({ url, body }: ExportRequest) =>
      client
        .execute(
          HttpClientRequest.setBody(
            HttpClientRequest.post(url),
            HttpBody.jsonUnsafe(body),
          ),
        )
        .pipe(
          Effect.timeout(options.requestTimeout),
          Effect.ignore,
          Effect.withTracerEnabled(false),
        );

    const worker = yield* Queue.take(queue).pipe(
      Effect.flatMap(send),
      Effect.forever,
      Effect.catchCause(() => Effect.void),
      Effect.forkScoped({ startImmediately: true }),
    );

    const timer = yield* Effect.sleep(options.batchInterval).pipe(
      Effect.andThen(Effect.sync(flush)),
      Effect.forever,
      Effect.forkScoped({ startImmediately: true }),
    );

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        closed = true;
        yield* Fiber.interrupt(timer);
        flush();
        yield* Queue.end(queue);
        yield* Fiber.await(worker);
      }).pipe(
        Effect.interruptible,
        Effect.timeoutOption(options.shutdownTimeout),
        Effect.asVoid,
      ),
    );

    const offer = (key: string | symbol, request: ExportRequest) => {
      if (closed) return;
      pending.set(key, request);
      if (pending.size >= options.maxBatchSize) flush();
    };

    return {
      offer: (request) => offer(Symbol(), request),
      offerProvisionalSpan: (spanKey, request) => offer(spanKey, request),
      // Replace the provisional record if it has not been flushed yet.
      offerCompletedSpan: (spanKey, request) => offer(spanKey, request),
    } satisfies RequestQueue;
  });
