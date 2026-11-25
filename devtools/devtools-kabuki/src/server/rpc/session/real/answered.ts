import { Effect, Stream } from 'effect';
import { KabukiSession } from '../../../../services/kabuki-session/contract/index.ts';
import { KabukiSessionRpcs } from '../contract/index.ts';

export const answered = KabukiSessionRpcs.toLayer(
  Effect.gen(function* () {
    const session = yield* KabukiSession;
    return {
      blueprint: () => Effect.orDie(session.blueprint()),
      watch: () => Stream.orDie(session.watch()),
      look: (asked) =>
        session.look(asked).pipe(Effect.catchTag('RpcClientError', Effect.die)),
      travel: (asked) =>
        session
          .travel(asked)
          .pipe(Effect.catchTag('RpcClientError', Effect.die)),
      fork: (asked) =>
        session.fork(asked).pipe(Effect.catchTag('RpcClientError', Effect.die)),
      send: (asked) =>
        session.send(asked).pipe(Effect.catchTag('RpcClientError', Effect.die)),
      fakes: () => Stream.orDie(session.fakes()),
      control: (asked) =>
        session
          .control(asked)
          .pipe(Effect.catchTag('RpcClientError', Effect.die)),
    };
  }),
);
