import { ConnectionsLive } from './actor.ts';
import { ConnectionsView, ConnectionsVoice } from './view.tsx';
import { Voice } from './voice/index.ts';

/**
 * The Connections Actor of one Account; what it draws while there is no
 * Connection to show; and Voice, drawn around the screen (`Around`).
 */
export const Connections = {
  actor: ConnectionsLive,
  view: ConnectionsView,
  voice: ConnectionsVoice,
  Around: Voice.Around,
};
