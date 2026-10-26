import { Schema } from 'effect';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import * as routes from '../../routes/index.ts';
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
 *
 * On a touch screen a sideways swipe opens the tab beside the one open,
 * as tapping it would (`swipe.tsx`).
 */

const Tab = Schema.Literals(['General', 'Shortcuts', 'Machines']);

export const Settings = Page.define({
  path: '/settings',
  metadata: { title: 'Settings · code' },
  requires: [Navigation],
  model: Schema.Struct({}),
  message: Schema.TaggedUnion({ TabSwiped: { tab: Tab } }),
  pages: {
    General: General.page,
    Shortcuts: Shortcuts.page,
    Machines: MachineSettings.page,
  },
});

export const SettingsLive = Page.build(Settings, {
  init: () => ({ model: {} }),
  on: {
    TabSwiped: ({ tab }) => ({ command: Router.push(routes.settings(tab)) }),
  },
  pages: {
    General: General.actor,
    Shortcuts: Shortcuts.actor,
    Machines: MachineSettings.actor,
  },
});
