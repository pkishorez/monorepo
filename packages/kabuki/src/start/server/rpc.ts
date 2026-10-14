import { Cause, Effect, Exit, Fiber, Stream } from 'effect';
import type { Outcome } from '../../routing/route/index.ts';
import { NDJSON, loadable, readAsk, writeLine } from '../common/index.ts';
import type { RoutesOnWire, Wanted } from '../common/index.ts';

/*
 * The Loader RPC, answered: the places a request asks for read with their
 * Schemas, their Loaders run at once, and each line written as its place is
 * done. The protocol is `common/wire.ts`.
 */

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
    },
  });

const reason = (error: { readonly cause?: unknown }) =>
  error.cause instanceof Error ? error.cause.message : 'the ask is not JSON';

/**
 * The server's side: reads the places a request asks for, then streams a
 * line per place as `each` answers it. `open` makes what the Loaders run
 * with before the answer starts, so the headers it adds go out with it; the
 * stream it hands back runs inside that. A malformed ask is a `400`.
 */
export const answer = async (
  routes: RoutesOnWire,
  request: Request,
  open: (
    wanted: ReadonlyArray<Wanted>,
  ) => Promise<Stream.Stream<readonly [string, Outcome]>>,
): Promise<Response> => {
  const places = loadable(routes);
  let wanted: ReadonlyArray<Wanted>;
  try {
    wanted = readAsk(places, await request.json());
  } catch (error) {
    return json({ error: reason({ cause: error }) }, 400);
  }
  const lines = await open(wanted);
  const encoder = new TextEncoder();
  let running: Fiber.Fiber<void> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      running = Effect.runFork(
        Stream.runForEach(lines, ([name, outcome]) =>
          Effect.sync(() =>
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify(writeLine(routes, places, { name, outcome }))}\n`,
              ),
            ),
          ),
        ),
      );
      running.addObserver((exit) => {
        if (Exit.isSuccess(exit)) return controller.close();
        const { cause } = exit as Exit.Failure<void, unknown>;
        if (!Cause.hasInterruptsOnly(cause))
          controller.error(Cause.squash(cause));
      });
    },
    // The browser went away: the Loaders still running stop.
    cancel: () =>
      running ? Effect.runPromise(Fiber.interrupt(running)) : undefined,
  });
  return new Response(body, {
    headers: { 'content-type': NDJSON, 'cache-control': 'private, no-store' },
  });
};
