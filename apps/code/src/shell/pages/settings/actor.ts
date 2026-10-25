import { Page } from '@kestack/kabuki/routing';
import { General } from './general/index.ts';
import { MachineSettings } from './machines/index.ts';
import { Shortcuts } from './shortcuts/index.ts';

/*
 * Settings, on no Machine, as three pages, each at its own address under
 * `/settings`, which alone opens General:
 *
 * 1. General    what this browser keeps for itself that the user sets
 *               (`general/`).
 * 2. Shortcuts  every Action's keys, kept in this browser (`shortcuts/`).
 * 3. Machines   the Account's Machines, each standing by its Line, with
 *               its own settings, kept on this device per Account and
 *               asked of the Machine behind (`machines/`).
 */

export const Settings = Page.define({
  path: '/settings',
  metadata: { title: 'Settings · code' },
  pages: {
    General: General.page,
    Shortcuts: Shortcuts.page,
    Machines: MachineSettings.page,
  },
});

export const SettingsLive = Page.build(Settings, {
  pages: {
    General: General.actor,
    Shortcuts: Shortcuts.actor,
    Machines: MachineSettings.actor,
  },
});
