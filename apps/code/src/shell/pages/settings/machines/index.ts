import { MachineSettings as page, MachineSettingsLive } from './actor.ts';
import { MachineSettingsView } from './view.tsx';

export const MachineSettings = {
  page,
  actor: MachineSettingsLive,
  view: MachineSettingsView,
};
