import { Deferred, Effect, Option, Ref } from 'effect';
import {
  ConnectionControl,
  type RunningConnection,
} from '../../../server/rpc/control/contract/index.js';
import { type Answers, Control } from '../contract/index.js';
import { reach as reachSocket, single } from './single.js';

export { NotRunning, SingleError } from './single.js';

export const hold = (path: string, name: string) =>
  Effect.gen(function* () {
    const answers = yield* Ref.make(Option.none<Answers>());
    const stopping = yield* Deferred.make<void>();
    const taken = yield* single(path, {
      group: ConnectionControl,
      handlers: ConnectionControl.toLayer({
        status: () =>
          Effect.flatMap(
            Ref.get(answers),
            Option.match({
              onNone: () =>
                Effect.succeed<RunningConnection>({ name, id: '', url: null }),
              onSome: ({ status }) => status,
            }),
          ),
        stop: () =>
          Effect.flatMap(
            Ref.get(answers),
            Option.match({
              onNone: () => Deferred.succeed(stopping, undefined),
              onSome: ({ stop }) => stop,
            }),
          ),
      }),
    });
    if (taken._tag === 'AlreadyRunning') return taken;
    return {
      _tag: 'Held',
      control: Control.of({
        answer: (given) =>
          Effect.acquireRelease(Ref.set(answers, Option.some(given)), () =>
            Ref.set(answers, Option.none()),
          ),
      }),
      stopping: Deferred.await(stopping),
    } as const;
  });

export const reach = (path: string) => reachSocket(path, ConnectionControl);
