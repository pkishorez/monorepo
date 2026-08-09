import { Cause, Duration, Effect, Fiber, Queue } from 'effect';
import { HttpBody, HttpClient, HttpClientRequest } from 'effect/unstable/http';

export interface ExportRequest {
  readonly url: string;
  readonly body: unknown;
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

type QueueItem =
  | { readonly _tag: 'Request'; readonly request: ExportRequest }
  | {
      readonly _tag: 'ProvisionalSpan';
      readonly spanKey: string;
      readonly request: ExportRequest;
    };

interface RequestQueueOptions {
  readonly retries: number;
  readonly requestTimeout: Duration.Input;
  readonly shutdownTimeout: Duration.Input;
}

/** Creates the ordered, non-batching transport used by development telemetry. */
export const makeRequestQueue = (options: RequestQueueOptions) =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<QueueItem, Cause.Done>();
    const pendingProvisionalSpans = new Set<string>();
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

    const process = (item: QueueItem) => {
      if (item._tag === 'Request') return send(item.request);
      if (!pendingProvisionalSpans.delete(item.spanKey)) return Effect.void;
      return send(item.request);
    };

    const worker = yield* Queue.take(queue).pipe(
      Effect.flatMap(process),
      Effect.forever,
      Effect.catchCause(() => Effect.void),
      Effect.forkScoped({ startImmediately: true }),
    );

    yield* Effect.addFinalizer(() =>
      Queue.end(queue).pipe(
        Effect.andThen(Fiber.await(worker)),
        Effect.interruptible,
        Effect.timeoutOption(options.shutdownTimeout),
        Effect.asVoid,
      ),
    );

    const offer = (request: ExportRequest) => {
      Queue.offerUnsafe(queue, { _tag: 'Request', request });
    };

    return {
      offer,
      offerProvisionalSpan(spanKey, request) {
        pendingProvisionalSpans.add(spanKey);
        Queue.offerUnsafe(queue, {
          _tag: 'ProvisionalSpan',
          spanKey,
          request,
        });
      },
      offerCompletedSpan(spanKey, request) {
        pendingProvisionalSpans.delete(spanKey);
        offer(request);
      },
    } satisfies RequestQueue;
  });
