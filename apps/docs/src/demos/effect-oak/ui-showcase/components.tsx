import { makeCombobox } from './combobox/index.js';
import { makeDialog, makeNestedDialog } from './dialog/index.js';
import { makeDisclosure } from './disclosure/index.js';
import { makeListbox } from './listbox/index.js';
import { makeMenu } from './menu/index.js';
import { makeSwitch } from './switch/index.js';
import { makeTabs } from './tabs/index.js';
import { makeTooltip } from './tooltip/index.js';

/*
 * Every component on show, each made once by its factory. A factory call
 * fixes what a parent would pass as props elsewhere: ids, labels, options,
 * panels. Each result is one Actor and its View; the showcase makes each
 * Actor a Child.
 */

const CITIES = [
  'Johannesburg',
  'Kyiv',
  'Oxford',
  'Plymouth',
  'Quito',
  'Wellington',
  'Zurich',
];
const PEOPLE = [
  'Michael Bluth',
  'Lindsay Funke',
  'Gob Bluth',
  'George Michael',
  'Maeby Funke',
  'Buster Bluth',
  'Tobias Funke',
  'Lucille Bluth',
];

export const dialog = makeDialog({
  id: 'dialog',
  trigger: 'Open dialog',
  title: 'Deactivate account',
  description: 'All of your data will be removed. This cannot be undone.',
  actions: [
    { label: 'Deactivate', value: 'Deactivate', variant: 'destructive' },
  ],
});

const confirmDelete = {
  id: 'confirm-delete',
  trigger: 'Delete project',
  triggerVariant: 'destructive',
  title: 'Delete this project?',
  description:
    'Escape closes only this dialog; the settings stay open below it.',
  actions: [
    { label: 'Delete', value: 'Deleted the project', variant: 'destructive' },
  ],
} as const;

export const settings = makeNestedDialog(
  {
    id: 'settings',
    trigger: 'Project settings',
    title: 'Project settings',
    description:
      'The danger zone below opens a second dialog, a Child of this one.',
    actions: [{ label: 'Save', value: 'Saved the settings' }],
  },
  confirmDelete,
);

export const menu = makeMenu({
  id: 'menu',
  label: 'Options',
  items: ['Edit', 'Duplicate', 'Archive', 'Move', 'Delete'],
});

export const tabsHorizontal = makeTabs({
  id: 'tabs-horizontal',
  label: 'Frameworks',
  orientation: 'horizontal',
  tabs: [
    {
      name: 'Foldkit',
      panel: 'The Elm Architecture on Effect, with its own virtual DOM.',
    },
    {
      name: 'React',
      panel: 'Components and hooks; here it only draws the tree.',
    },
    { name: 'Elm', panel: 'Where Model, Update, View and Commands came from.' },
  ],
});

export const tabsVertical = makeTabs({
  id: 'tabs-vertical',
  label: 'Frameworks, vertical',
  orientation: 'vertical',
  tabs: [
    { name: 'Foldkit', panel: 'Arrow Up and Down move between these tabs.' },
    { name: 'React', panel: 'Only the selected tab is in the Tab order.' },
    { name: 'Elm', panel: 'Home and End jump to the first and last tab.' },
  ],
});

export const listbox = makeListbox({
  id: 'listbox',
  label: 'Assignee',
  options: PEOPLE,
});

export const listboxMulti = makeListbox({
  id: 'listbox-multi',
  label: 'Reviewers',
  options: PEOPLE,
  multiple: true,
  initial: ['Gob Bluth'],
});

export const combobox = makeCombobox({
  id: 'combobox',
  label: 'City',
  options: CITIES,
});

export const disclosure = makeDisclosure({
  id: 'disclosure',
  title: 'What is Foldkit?',
  body: 'Foldkit is an Elm-inspired UI framework built on Effect. Effect Oak borrows its architecture and draws with React.',
});

export const disclosurePreview = makeDisclosure({
  id: 'disclosure-preview',
  title: 'Collapsed preview',
  preview: true,
  body: 'This panel folds to its first lines instead of hiding. Opening it is one Message, and the height animates with CSS, so Time Travel shows it open or closed at once. The button below the text is part of the same Actor; its label follows the Model. Nothing is reported up: whether a disclosure is open matters only to itself.',
});

export const notifications = makeSwitch({
  id: 'notifications',
  label: 'Email notifications',
});

export const tooltip = makeTooltip({
  id: 'tooltip',
  label: 'More information',
  text: 'Shows after 500 ms of hovering, or at once on focus.',
  delayMs: 500,
});

export const tooltipNoDelay = makeTooltip({
  id: 'tooltip-no-delay',
  label: 'Shortcut',
  text: 'Shows at once.',
  delayMs: 0,
});

/** Reports that become a toast too, with the toast's title. */
export const ANNOUNCED: Readonly<Record<string, string>> = {
  dialog: 'Account',
  settings: 'Settings',
  'confirm-delete': 'Project',
  menu: 'Menu',
};
