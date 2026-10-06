import {
  CalendarDays,
  CalendarRange,
  FileText,
  Hand,
  House,
  Keyboard,
  List,
  type LucideIcon,
  Settings,
  SlidersHorizontal,
  Wallet,
} from '@kstackz/ui-toolkit/lucide';
import type { ActionId } from '../../commands/index.ts';
import {
  type Account,
  isMonthKey,
  monthName,
} from '../../../shared/ledger/index.ts';
import { accountIcon } from '../parts/index.ts';

type Place = {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly to: '/' | '/entries' | '/months' | '/settings';
  readonly command: 'toHome' | 'toEntries' | 'toMonths' | 'toSettings';
};

/**
 * Every Place to Go to, in the Place order: what the Sidebar lists and what
 * a Thumb Lock Steps through.
 */
export const PLACES: ReadonlyArray<Place> = [
  { id: 'home', label: 'Home', icon: House, to: '/', command: 'toHome' },
  {
    id: 'entries',
    label: 'Entries',
    icon: List,
    to: '/entries',
    command: 'toEntries',
  },
  {
    id: 'months',
    label: 'Months',
    icon: CalendarRange,
    to: '/months',
    command: 'toMonths',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    to: '/settings',
    command: 'toSettings',
  },
];

/**
 * One stop of the Thumb Picker: what it is called, and the Command that
 * Goes there or the Account whose Entries it shows. One with neither is
 * where you are, or only the way in to the stops inside it.
 */
export type Stop = {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly command?: ActionId;
  readonly account?: string;
  readonly children?: ReadonlyArray<Stop>;
};

// The Sections of Settings, its tabs, in order.
const SETTINGS_SECTIONS: ReadonlyArray<Stop> = [
  {
    id: 'general',
    label: 'General',
    icon: SlidersHorizontal,
    command: 'toGeneralSettings',
  },
  { id: 'keys', label: 'Keys', icon: Keyboard, command: 'toKeysSettings' },
  {
    id: 'gestures',
    label: 'Gestures',
    icon: Hand,
    command: 'toGesturesSettings',
  },
];

// An Entry or a Month you are on, just under its list.
const underOf = (place: string, part: string): Stop | undefined => {
  if (place === 'entries' && part !== '') {
    return { id: 'entry', label: 'This entry', icon: FileText };
  }
  if (place === 'months' && isMonthKey(part)) {
    return { id: 'month', label: monthName(part), icon: CalendarDays };
  }
  return undefined;
};

/**
 * What a Thumb Lock picks from on this page, and where it starts: every
 * Place in order, with an Entry or a Month you are on just under its list,
 * the Accounts, if there are any, before Settings, each going to its
 * Entries as in the Sidebar, and the Sections of Settings inside it.
 */
export const stopsFrom = (where: {
  readonly pathname: string;
  readonly tab?: string;
  readonly account?: string;
  readonly accounts: ReadonlyArray<Pick<Account, 'id' | 'name' | 'kind'>>;
}): {
  readonly tree: ReadonlyArray<Stop>;
  readonly start: ReadonlyArray<string>;
} => {
  const [, place = '', part = ''] = where.pathname.split('/');
  const under = underOf(place, part);
  const accounts: ReadonlyArray<Stop> = where.accounts.map((account) => ({
    id: account.id,
    label: account.name,
    icon: accountIcon(account.kind),
    account: account.id,
  }));
  const tree = PLACES.flatMap((each): ReadonlyArray<Stop> => {
    if (each.id === 'settings') {
      const settings = { ...each, children: SETTINGS_SECTIONS };
      if (accounts.length === 0) return [settings];
      const group = {
        id: 'accounts',
        label: 'Accounts',
        icon: Wallet,
        children: accounts,
      };
      return [group, settings];
    }
    return each.to === `/${place}` && under ? [each, under] : [each];
  });
  return { tree, start: startOf(where, place, under) };
};

// The ids of the stops you are on, top to bottom.
const startOf = (
  where: Parameters<typeof stopsFrom>[0],
  place: string,
  under: Stop | undefined,
): ReadonlyArray<string> => {
  if (under) return [under.id];
  if (place === 'settings') return ['settings', where.tab ?? 'general'];
  const account = where.accounts.find((each) => each.id === where.account);
  if (place === 'entries' && account) return ['accounts', account.id];
  return [PLACES.find((each) => each.to === `/${place}`)?.id ?? 'home'];
};
