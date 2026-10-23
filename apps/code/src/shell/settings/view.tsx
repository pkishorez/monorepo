import { View } from '@kestack/kabuki/react';
import { SettingsLive } from './actor.ts';
import * as MachineSettings from './machines/index.ts';
import * as Shortcuts from './shortcuts/index.ts';

/*
 * Settings: every Machine, each with its own settings in its own section,
 * then every Action's keys.
 */

export const SettingsView = View.make(SettingsLive, ({ root, children }) => (
  <div {...root} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 md:py-10">
      <MachineSettings.View instance={children.machines} />
      <Shortcuts.View instance={children.shortcuts} />
    </div>
  </div>
));
