import { Effect, Layer } from 'effect';
import { History } from '@kestack/kabuki';
import type { FakeWorld } from '@kestack/kabuki/fake';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import { KabukiSession } from '../contract/index.ts';
import { treeOf } from './blueprint.ts';
import { controlOf, fakesOf } from './fakes.ts';
import { lookAt } from './look.ts';
import { runtimeOf, stepNotFound } from './running.ts';
import { sendTo } from './send.ts';
import { watchOf } from './watch.ts';

export const inPage = (
  app: AppRuntime,
  world?: FakeWorld,
): Layer.Layer<KabukiSession> =>
  Layer.succeed(KabukiSession)({
    blueprint: () =>
      Effect.map(runtimeOf(app), ({ actor }) => ({
        root: treeOf(actor.blueprint),
      })),

    watch: () => watchOf(app),

    look: (asked) => lookAt(app, asked),

    travel: ({ to }) =>
      Effect.gen(function* () {
        yield* runtimeOf(app);
        if (to === null) return app.toHead();
        if (to === 'start') return app.seek(null);
        if (!History.entry(app.history, to))
          return yield* stepNotFound(app.history, to);
        app.seek(to);
      }),

    fork: ({ from }) =>
      Effect.gen(function* () {
        yield* runtimeOf(app);
        if (from === 'start') return app.fork(null);
        if (!History.entry(app.history, from))
          return yield* stepNotFound(app.history, from);
        app.fork(from);
      }),

    send: (asked) => sendTo(app, asked),

    fakes: () => fakesOf(world),

    control: (asked) => controlOf(world, asked),
  });
