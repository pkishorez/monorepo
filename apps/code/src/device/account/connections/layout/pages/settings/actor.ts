import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import * as routes from '../../../../../routes/index.ts';
import { General } from './browser/general/index.ts';
import { Shortcuts } from './browser/shortcuts/index.ts';
import { ConnectionSettings } from './connections/index.ts';

/*
 * Settings, on no Connection, at `/settings`, as four tabs:
 *
 * 1. Browser      what this browser keeps for itself (`browser/`).
 *    - General    what the user sets here (`general/`).
 *    - Shortcuts  every Action's keys (`shortcuts/`).
 *    - About      this version of Code, its updates, and a fresh start
 *                 that deletes everything kept here (`about/`), drawn
 *                 alone, with no Actor of its own.
 * 2. Connections  the Account's Connections, each standing by its Link, with
 *                 its own settings, kept on this device per Account and
 *                 asked of the Connection behind (`connections/`).
 *
 * Each tab with an Actor is held here the whole time Settings are open.
 * Which tab is open is theirs alone, never in the address: General,
 * unless a link asked for another as it opened them. On a touch screen a
 * sideways swipe opens the tab beside the one open, as tapping it does
 * (`ui/tabs`).
 */

const Tab = Schema.Literals(routes.SETTINGS_TABS);

export const Settings = Page.define({
  path: '/settings',
  metadata: { title: 'Settings · code' },
  model: Schema.Struct({ open: Tab }),
  message: Schema.TaggedUnion({ TabChosen: { tab: Tab } }),
});

export const SettingsLive = Page.build(Settings, {
  init: () => ({ model: { open: routes.settingsTabAsked() } }),
  children: (child) => ({
    general: child(General.actor),
    shortcuts: child(Shortcuts.actor),
    connections: child(ConnectionSettings.actor),
  }),
  on: {
    TabChosen: ({ tab }, { model }) =>
      tab === model.open ? {} : { model: { open: tab } },
  },
});
