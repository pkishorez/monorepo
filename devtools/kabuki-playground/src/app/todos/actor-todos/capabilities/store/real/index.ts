import { Effect, Layer } from 'effect';
import { Server } from '../../../../../../services/server/contract/index.ts';
import { Store } from '../../store/contract/index.ts';

export const storeLayer = () =>
  Layer.effect(
    Store,
    Effect.gen(function* () {
      const server = yield* Server;
      return { save: server.save };
    }),
  );
