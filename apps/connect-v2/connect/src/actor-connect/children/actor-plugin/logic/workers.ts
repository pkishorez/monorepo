import { Duration, Effect } from 'effect';
import type { SelfOf, WorkersOf } from '@kestack/kabuki/types';
import { Plugins } from '../../../../services/plugins/contract/index.js';
import type { PluginShape } from './shared/index.js';

type PluginSelf = SelfOf<typeof PluginShape>;

const run = (self: PluginSelf) =>
  Effect.gen(function* () {
    const plugins = yield* Plugins;
    const { model } = yield* self.get;
    yield* Effect.log(
      `Starting ${model.name} ${model.release.hash.slice(0, 12)}`,
    );
    const started = yield* Effect.result(
      plugins.start({
        name: model.name,
        release: model.release,
        ...model.home,
      }),
    );
    if (started._tag === 'Failure') {
      yield* Effect.logWarning(started.failure.message);
      return yield* self.send({
        _tag: 'PluginStartFailed',
        reason: started.failure.message,
        log: [...started.failure.log],
      });
    }
    yield* Effect.log(`${model.name} is running`);
    yield* self.send({ _tag: 'PluginStarted' });
    const exit = yield* started.success.exited;
    yield* Effect.logWarning(`${model.name} exited with ${exit.code}`);
    yield* self.send({
      _tag: 'PluginExited',
      code: exit.code,
      log: [...exit.log],
    });
  }).pipe(Effect.scoped);

const backoff = (self: PluginSelf) =>
  Effect.gen(function* () {
    const { state } = yield* self.get;
    if (state._tag !== 'Crashed') return;
    const now = yield* self.now;
    yield* Effect.sleep(Duration.millis(Math.max(0, state.retryAt - now)));
    yield* self.send({ _tag: 'BackoffEnded' });
  });

export const workers: WorkersOf<typeof PluginShape> = {
  run: {
    while: ({ state }) => state._tag !== 'Crashed',
    run,
  },
  backoff: {
    while: ({ state }) => state._tag === 'Crashed',
    run: backoff,
  },
};
