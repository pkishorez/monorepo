import { Effect, Layer, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import {
  InspectorLive,
  KabukiSession,
} from '@kestack/devtools-kabuki/inspector';
import { Sessions } from '../../sessions/index.js';

/*
 * One Kabuki Session reached through DevTools: it dials the Kabuki
 * Session's Api as it starts, Provides it as the Inspector's
 * `KabukiSession`, and places the Inspector on it. Picking a Step on the
 * Timeline travels the real tab. A Kabuki Session of another name, or one
 * that connected again, is a fresh one of these, so the Inspector never
 * reads a socket that has closed.
 */

export const RemoteInspector = Actor.define('RemoteInspector', {
  requires: [Sessions],
  input: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({ name: Schema.String }),
});

export const RemoteInspectorLive = Actor.build(RemoteInspector, {
  init: ({ name }) => ({ model: { name } }),
  provides: (self) =>
    Layer.effect(KabukiSession)(
      Effect.gen(function* () {
        const sessions = yield* Sessions;
        const { model } = yield* self.get;
        return yield* sessions.dial(model.name);
      }),
    ),
  children: (child) => ({
    inspector: child(InspectorLive, {
      input: () => ({
        travel: true,
        look: { presenting: false, place: 'bottom' as const },
      }),
    }),
  }),
});
