import { Effect, Layer } from 'effect';
import { KabukiSession } from '@kestack/devtools-kabuki/inspector';
import { Sessions } from '../../../../../../services/sessions/contract/index.js';
import type { SelfOf } from '@kestack/kabuki/types';
import type { RemoteInspectorShape } from '../../../logic/shared/index.js';

export const kabukiSessionLayer = (self: SelfOf<typeof RemoteInspectorShape>) =>
  Layer.effect(KabukiSession)(
    Effect.gen(function* () {
      const sessions = yield* Sessions;
      const { model } = yield* self.get;
      return yield* sessions.dial(model.name);
    }),
  );
