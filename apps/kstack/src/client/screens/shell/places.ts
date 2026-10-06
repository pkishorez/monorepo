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
