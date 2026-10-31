import { Cause, Effect, Layer, Stream } from 'effect';
import { Loading } from '../../routing/index.ts';
import { PATH, loadable, readLine, writeAsk } from '../app/protocol/index.ts';
import type { Line, RoutesOnWire } from '../app/protocol/index.ts';

/*
 * The Loader RPC, asked: the `Loading` behind the browser's Data cache, one
 * request for every place asked for at once, each answered as its line
 * comes. The protocol is `app/protocol/wire.ts`.
 */

/**
 * The browser's side: a `Loading` that asks the server, in one request per
 * ask, and hands on each place's answer as it comes. A request that does
 * not get an answer breaks every place it asked for, so each page shows it
 * failed and can retry.
 */
export const loading = (
  routes: RoutesOnWire,
  options: { readonly fetch?: typeof fetch; readonly url?: string } = {},
): Layer.Layer<Loading> => {
  const places = loadable(routes);
  const send = options.fetch ?? ((input, init) => fetch(input, init));
  const each: NonNullable<(typeof Loading.Service)['each']> = (wanted) => {
    const answered = new Set<string>();
    let broken: string | undefined;
    return Stream.unwrap(
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: (signal) =>
            send(options.url ?? PATH, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(writeAsk(places, wanted)),
              signal,
            }),
          catch: (cause) => cause,
        });
        if (!response.ok || !response.body)
          return yield* Effect.fail(
            new Error(`the Loader RPC answered ${response.status}`),
          );
        return Stream.fromReadableStream({
          evaluate: () => response.body!,
          onError: (cause) => cause,
        }).pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.filter((line) => line.trim() !== ''),
          Stream.map((line): readonly [string, Loading.Answer] | null => {
            try {
              const read = readLine(routes, places, JSON.parse(line) as Line);
              answered.add(read.name);
              return [read.name, read.outcome as Loading.Answer];
            } catch (error) {
              broken = error instanceof Error ? error.message : String(error);
              return null;
            }
          }),
          Stream.filter(
            (entry): entry is readonly [string, Loading.Answer] =>
              entry !== null,
          ),
        );
      }),
    ).pipe(
      Stream.catchCause((cause) => {
        const error = Cause.squash(cause);
        broken =
          error instanceof Error
            ? error.message
            : 'the Loader RPC did not answer';
        return Stream.empty;
      }),
      // Every place the answer did not reach is broken, with why if it broke.
      Stream.concat(
        Stream.suspend(() =>
          Stream.fromIterable(
            wanted
              .filter(({ name }) => !answered.has(name))
              .map(
                ({ name }) =>
                  [
                    name,
                    {
                      _tag: 'Broken',
                      reason: broken ?? `no answer for ${name}`,
                    } as Loading.Answer,
                  ] as const,
              ),
          ),
        ),
      ),
    );
  };

  return Layer.succeed(Loading, {
    each,
    load: (wanted) =>
      Stream.runCollect(each(wanted)).pipe(
        Effect.map((answers) => Object.fromEntries(answers)),
      ),
  });
};
