import { Schema } from 'effect';

/*
 * The showcase's pages and which reports each shows. A page is Model data,
 * not a State: every component is a Child kept for the whole app, so what
 * you picked on one page is still there when you come back (blocker 10).
 */

export const PAGES = [
  'Dialog',
  'Menu',
  'Tabs',
  'Listbox',
  'Combobox',
  'Disclosure',
  'Switch',
  'Tooltip',
  'Toast',
] as const;

export const Page = Schema.Literals(PAGES);
export type Page = typeof Page.Type;

/** The sources whose reports the page lists under "What the parent heard". */
export const HEARD: Record<Page, ReadonlyArray<string>> = {
  Dialog: ['dialog', 'settings', 'confirm-delete'],
  Menu: ['menu'],
  Tabs: ['tabs-horizontal', 'tabs-vertical'],
  Listbox: ['listbox', 'listbox-multi'],
  Combobox: ['combobox'],
  Disclosure: [],
  Switch: ['notifications'],
  Tooltip: [],
  Toast: [],
};
