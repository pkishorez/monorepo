import { Duration, Effect, Layer, Queue } from 'effect';
import {
  type CacheError,
  type DownloadFailed,
  Downloads,
  type HashMismatch,
} from '../../downloads/contract/index.js';
import {
  type Exit,
  Plugins,
  PluginStartFailed,
  type PluginRun,
} from '../contract/index.js';
import { child, LOG_LINES, previousGone, socketFree } from './process.js';

const READY_WITHIN = Duration.minutes(1);
const MARK_EVERY = Duration.hours(24);

const tail = (log: ReadonlyArray<string>, lines: ReadonlyArray<string>) =>
  [...log, ...lines].slice(-LOG_LINES);

const whyNotDownloaded = (
  run: PluginRun,
  error: DownloadFailed | HashMismatch | CacheError,
) => {
  switch (error._tag) {
    case 'HashMismatch':
      return `${run.release.url} is not the Plugin asked for: its sha256 is ${error.actual}`;
    case 'DownloadFailed':
      return error.missing
        ? `${run.name} ${run.release.hash} has no file; run the build`
        : `Could not download ${run.release.url}: ${error.message}`;
    case 'CacheError':
      return `Could not keep ${run.release.url} in ${error.path}: ${error.message}`;
  }
};

const startFailed = (message: string, log: ReadonlyArray<string> = []) =>
  new PluginStartFailed({ message, log: tail(log, [message]) });

const start = (downloads: Downloads['Service']) => (run: PluginRun) =>
  Effect.gen(function* () {
    const file = yield* downloads
      .fetch({
        url: run.release.url,
        sha256: run.release.hash,
        name: 'plugin.mjs',
      })
      .pipe(
        Effect.mapError((error) => startFailed(whyNotDownloaded(run, error))),
      );
    yield* Effect.forkScoped(
      downloads
        .use(run.release.hash)
        .pipe(
          Effect.ignore,
          Effect.andThen(Effect.sleep(MARK_EVERY)),
          Effect.forever,
        ),
    );
    if (!(yield* previousGone(run.folders.data)))
      return yield* startFailed(
        `The ${run.name} Plugin before it did not exit`,
      );
    if (!(yield* socketFree(run.socket)))
      return yield* startFailed(
        `${run.socket} is still in use by another process`,
      );
    const events = yield* child(run, file);
    let log: ReadonlyArray<string> = [];
    const untilReady = Effect.gen(function* () {
      while (true) {
        const event = yield* Queue.take(events);
        if (event._tag === 'Lines') log = tail(log, event.lines);
        if (event._tag === 'Ready') return;
        if (event._tag === 'Exit')
          return yield* startFailed(
            `${run.name} exited with ${event.code} before it was ready`,
            log,
          );
      }
    });
    yield* untilReady.pipe(
      Effect.timeoutOrElse({
        duration: READY_WITHIN,
        orElse: () =>
          Effect.fail(
            startFailed(
              `${run.name} did not say it was ready within ${Duration.format(READY_WITHIN)}`,
              log,
            ),
          ),
      }),
    );
    const exited = Effect.gen(function* () {
      while (true) {
        const event = yield* Queue.take(events);
        if (event._tag === 'Lines') log = tail(log, event.lines);
        if (event._tag === 'Exit')
          return { code: event.code, log } satisfies Exit;
      }
    });
    return { exited };
  });

export const layer = Layer.effect(
  Plugins,
  Effect.map(Downloads, (downloads) => Plugins.of({ start: start(downloads) })),
);
