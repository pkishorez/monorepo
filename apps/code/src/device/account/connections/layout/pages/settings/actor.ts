import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import * as routes from '../../../../../routes/index.ts';
import { General } from './general/index.ts';
import { ConnectionSettings } from './connections/index.ts';
import { Shortcuts } from './shortcuts/index.ts';

/*
 * Settings, on no Connection, at `/settings`, as three tabs, each held here
 * the whole time Settings are open:
 *
 * 1. General    what this browser keeps for itself that the user sets
 *               (`general/`).
 * 2. Shortcuts  every Action's keys, kept in this browser (`shortcuts/`).
 * 3. Connections   the Account's Connections, each standing by its Link, with
 *               its own settings, kept on this device per Account and
 *               asked of the Connection behind (`connections/`).
 *
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
  children: {
    general: { actor: General.actor },
    shortcuts: { actor: Shortcuts.actor },
    connections: { actor: ConnectionSettings.actor },
  },
  on: {
    TabChosen: ({ tab }, { model }) =>
      tab === model.open ? {} : { model: { open: tab } },
  },
});
