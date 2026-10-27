import { MachinesLive } from './actor.ts';
import { MachinesView, MachinesVoice } from './view.tsx';
import { Voice } from './voice/index.ts';

/**
 * The Machines Actor of one Account; what it draws while there is no
 * Machine to show; and Voice, drawn around the screen (`Around`).
 */
export const Machines = {
  actor: MachinesLive,
  view: MachinesView,
  voice: MachinesVoice,
  Around: Voice.Around,
};
