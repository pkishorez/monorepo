import { Page } from '@kestack/kabuki/routing';
import * as MachineSettings from './machines/index.ts';
import * as Shortcuts from './shortcuts/index.ts';

/*
 * Settings, on no Machine: the Account's Machines, each with its own
 * settings, which load on their own (`machines/`), and every Action's
 * keys, kept in this browser, which Shortcuts changes.
 */

export const Settings = Page.define({
  path: '/settings',
  metadata: { title: 'Settings · code' },
});

export const SettingsLive = Page.build(Settings, {
  children: {
    machines: { actor: MachineSettings.Live },
    shortcuts: { actor: Shortcuts.Live },
  },
});
