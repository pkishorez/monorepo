import { Effect, Layer } from 'effect';
import { History } from '@kestack/kabuki';
import type { FakeWorld } from '@kestack/kabuki/fake';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import { KabukiSession } from '../contract/index.ts';
import { controlOf, fakesOf } from './fakes.ts';
import { historyOf } from './history.ts';
import { lookAt } from './look.ts';
import { runtimeOf, stepNotFound } from './running.ts';
import { sendTo } from './send.ts';
import { stepAt } from './step.ts';

export const inPage = (
  app: AppRuntime,
  world?: FakeWorld,
): Layer.Layer<KabukiSession> =>
  Layer.succeed(KabukiSession)({
    history: (asked) => historyOf(app, asked),

    step: (asked) => stepAt(app, asked),

    look: (asked) => lookAt(app, asked),

    preview: ({ at }) =>
      Effect.gen(function* () {
        yield* runtimeOf(app);
        if (at === null) return app.toHead();
        if (at === 'start') return app.seek(null);
        if (!History.entry(app.history, at))
          return yield* stepNotFound(app.history, at);
        app.seek(at);
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

    world: () => fakesOf(world),

    control: (asked) => controlOf(world, asked),
  });
