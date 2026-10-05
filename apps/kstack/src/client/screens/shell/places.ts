import {
  CalendarDays,
  CalendarRange,
  FileText,
  House,
  List,
  type LucideIcon,
  Settings,
} from '@kstackz/ui-toolkit/lucide';
import { isMonthKey, monthName } from '../../../domain/ledger/index.ts';

type Place = {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly to: '/' | '/entries' | '/months' | '/settings';
  readonly command: 'toHome' | 'toEntries' | 'toMonths' | 'toSettings';
};

/**
 * Every Place to Go to, in the Place order: what the Sidebar lists, what a
 * Thumb Lock Steps through, and what the page slides by.
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

type Here = {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
};

// Where a page is in the Place order: on one of the Places, or, for an
// Entry or a Month, just under its list.
const whereIs = (
  pathname: string,
): { readonly index: number; readonly under?: Here } | undefined => {
  const [, place = '', part = ''] = pathname.split('/');
  const index = PLACES.findIndex((each) => each.to === `/${place}`);
  if (index < 0) return undefined;
  if (place === 'entries' && part !== '') {
    return {
      index,
      under: { id: 'entry', label: 'This entry', icon: FileText },
    };
  }
  if (place === 'months' && isMonthKey(part)) {
    return {
      index,
      under: { id: 'month', label: monthName(part), icon: CalendarDays },
    };
  }
  return { index };
};

/**
 * What a Thumb Lock Steps through from this page: every Place in order,
 * with an Entry or a Month in it just under its list, and where it starts.
 */
export const stepsFrom = (pathname: string) => {
  const at = whereIs(pathname) ?? { index: 0 };
  if (at.under === undefined) return { items: PLACES, start: at.index };
  return {
    items: [
      ...PLACES.slice(0, at.index + 1),
      at.under,
      ...PLACES.slice(at.index + 1),
    ],
    start: at.index + 1,
  };
};

const orderOf = (pathname: string) => {
  const at = whereIs(pathname);
  return at && at.index + (at.under ? 0.5 : 0);
};

/**
 * How the page moves on every Go, however it was given: up to a Place later
 * in the order, down to an earlier one, and not at all within one Place or
 * outside Ledger's. The styles key on these view transition types.
 */
export const PAGE_TRANSITION = {
  types: (change: {
    readonly fromLocation?: { readonly pathname: string };
    readonly toLocation: { readonly pathname: string };
  }) => {
    const from = change.fromLocation && orderOf(change.fromLocation.pathname);
    const to = orderOf(change.toLocation.pathname);
    if (from === undefined || to === undefined || from === to) return false;
    return [to > from ? 'up' : 'down'];
  },
};
