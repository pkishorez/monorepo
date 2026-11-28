import { Config, Effect, Layer } from 'effect';
import { NodeRuntime } from '@effect/platform-node';
import { Connect } from './actor-connect/index.js';
import { attach, headless } from './devtools/index.js';
import { devInput, makeWorld } from './fakes.js';

const DEFAULT_DEVTOOLS = 'http://127.0.0.1:14400';

const dev = Effect.gen(function* () {
  const devtools = yield* Config.String('KE_DEVTOOLS').pipe(
    Config.withDefault(DEFAULT_DEVTOOLS),
  );
  const world = makeWorld();
  const context = yield* Layer.build(world.layer);
  const app = yield* headless(Connect, {
    name: 'ke-connect',
    input: devInput(),
    layer: Layer.succeedContext(context),
  });
  yield* attach(app, {
    url: devtools,
    environment: 'fakes',
    name: 'ke-connect-fakes',
    world,
  });
  yield* Effect.log(
    `Connect runs on Fakes; open ${devtools}/kabuki and pick ke-connect-fakes`,
  );
  return yield* Effect.never;
}).pipe(Effect.scoped);

NodeRuntime.runMain(dev);
