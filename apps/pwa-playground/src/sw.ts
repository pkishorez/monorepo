// The service worker entry pwa() bundles to /sw.js: the toolkit's worker
// (Precache, Runtime Cache, navigation, updates) plus a Worker Server.
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schedule from 'effect/Schedule';
import * as Stream from 'effect/Stream';
import { runServiceWorker, WorkerHost } from 'pwa-toolkit/worker';
import { WorkerServer } from 'pwa-toolkit/worker-rpc/server';
import { PlaygroundRpcs } from './rpc/index.ts';

// When this worker instance started; changes each time the browser restarts it.
const startedAt = new Date().toISOString();

const handlers = PlaygroundRpcs.toLayer(
  Effect.gen(function* () {
    const host = yield* WorkerHost;
    return {
      Echo: ({ text }) =>
        Effect.succeed({ text, at: new Date().toISOString() }),
      Ticks: ({ count }) =>
        Stream.fromSchedule(Schedule.spaced('1 second')).pipe(
          Stream.take(count),
          Stream.map((n) => n + 1),
        ),
      WorkerInfo: () => Effect.succeed({ buildId: host.buildId, startedAt }),
    };
  }),
);

runServiceWorker({
  layer: WorkerServer.layer(PlaygroundRpcs).pipe(Layer.provide(handlers)),
});
