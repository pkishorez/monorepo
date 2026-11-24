import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Sessions } from '../../../../../services/sessions/contract/index.js';

/*
 * One Kabuki Session reached through DevTools: it dials the Kabuki
 * Session's Api as it starts, Provides it as the Inspector's
 * `KabukiSession`, and places the Inspector on it. Picking a Step on the
 * Timeline travels the real tab. A Kabuki Session of another name, or one
 * that connected again, is a fresh one of these, so the Inspector never
 * reads a socket that has closed.
 */

export const RemoteInspectorShape = Actor.define('RemoteInspector', {
  requires: [Sessions],
  input: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({ name: Schema.String }),
});
