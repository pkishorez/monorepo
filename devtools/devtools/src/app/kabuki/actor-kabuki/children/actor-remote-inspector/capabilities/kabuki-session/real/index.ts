import { Effect, Layer } from 'effect';
import { Sessions } from '../../../../../../services/sessions/contract/index.js';
import type { SelfOf } from '@kestack/kabuki/types';
import type { RemoteInspectorShape } from '../../../logic/shared/index.js';

export const kabukiSessionLayer = (self: SelfOf<typeof RemoteInspectorShape>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const sessions = yield* Sessions;
      const { model } = yield* self.get;
      return sessions.session(model.name);
    }),
  );
