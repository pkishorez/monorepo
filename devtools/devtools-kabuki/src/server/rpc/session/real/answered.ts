import { Effect, Stream } from 'effect';
import { KabukiSession } from '../../../../services/kabuki-session/contract/index.ts';
import { KabukiSessionRpcs } from '../contract/index.ts';

export const answered = KabukiSessionRpcs.toLayer(
  Effect.gen(function* () {
    const session = yield* KabukiSession;
    return {
      history: (asked) => Stream.orDie(session.history(asked)),
      step: (asked) =>
        session.step(asked).pipe(Effect.catchTag('RpcClientError', Effect.die)),
      look: (asked) =>
        session.look(asked).pipe(Effect.catchTag('RpcClientError', Effect.die)),
      preview: (asked) =>
        session
          .preview(asked)
          .pipe(Effect.catchTag('RpcClientError', Effect.die)),
      fork: (asked) =>
        session.fork(asked).pipe(Effect.catchTag('RpcClientError', Effect.die)),
      send: (asked) =>
        session.send(asked).pipe(Effect.catchTag('RpcClientError', Effect.die)),
      world: () => Stream.orDie(session.world()),
      control: (asked) =>
        session
          .control(asked)
          .pipe(Effect.catchTag('RpcClientError', Effect.die)),
      blueprint: () =>
        session.blueprint().pipe(Effect.catchTag('RpcClientError', Effect.die)),
    };
  }),
);
