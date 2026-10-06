import type { ActionId } from '../commands/index.ts';
import {
  type Account,
  isMonthKey,
  monthName,
} from '../../shared/ledger/index.ts';

/** A Place you Go to by its Command. */
export type PlaceId = 'home' | 'entries' | 'months' | 'settings';

/** A Section of Settings. */
export type SectionId = 'general' | 'keys' | 'gestures';

type Place = {
  readonly id: PlaceId;
  readonly label: string;
  readonly to: '/' | '/entries' | '/months' | '/settings';
  readonly command: 'toHome' | 'toEntries' | 'toMonths' | 'toSettings';
};

/**
 * Every Place to Go to, in the Place order: what the Sidebar lists and what
 * a Thumb Lock Steps through. `to` is its address in either app.
 */
export const PLACES: ReadonlyArray<Place> = [
  { id: 'home', label: 'Home', to: '/', command: 'toHome' },
  { id: 'entries', label: 'Entries', to: '/entries', command: 'toEntries' },
  { id: 'months', label: 'Months', to: '/months', command: 'toMonths' },
  { id: 'settings', label: 'Settings', to: '/settings', command: 'toSettings' },
];

type Section = {
  readonly id: SectionId;
  readonly label: string;
  readonly command: ActionId;
};

/** The Sections of Settings, in order. */
export const SETTINGS_SECTIONS: ReadonlyArray<Section> = [
  { id: 'general', label: 'General', command: 'toGeneralSettings' },
  { id: 'keys', label: 'Keys', command: 'toKeysSettings' },
  { id: 'gestures', label: 'Gestures', command: 'toGesturesSettings' },
];

/**
 * What a stop shows as its icon, for each app to draw its own way: the
 * Place's or Section's id, an Entry or a Month you are on, the Accounts, or
 * an Account's kind.
 */
export type StopIcon =
  | PlaceId
  | SectionId
  | 'entry'
  | 'month'
  | 'accounts'
  | Account['kind'];

/**
 * One stop of the Thumb Picker: what it is called, and the Command that
 * Goes there or the Account whose Entries it shows. One with neither is
 * where you are, or only the way in to the stops inside it.
 */
export type Stop = {
  readonly id: string;
  readonly label: string;
  readonly icon: StopIcon;
  readonly command?: ActionId;
  readonly account?: string;
  readonly children?: ReadonlyArray<Stop>;
};

// An Entry or a Month you are on, just under its list.
const underOf = (place: string, part: string): Stop | undefined => {
  if (place === 'entries' && part !== '') {
    return { id: 'entry', label: 'This entry', icon: 'entry' };
  }
  if (place === 'months' && isMonthKey(part)) {
    return { id: 'month', label: monthName(part), icon: 'month' };
  }
  return undefined;
};

const stopOf = (place: Place): Stop => ({
  id: place.id,
  label: place.label,
  icon: place.id,
  command: place.command,
});

/**
 * What a Thumb Lock picks from on this page, and where it starts: every
 * Place in order, with an Entry or a Month you are on just under its list,
 * the Accounts, if there are any, before Settings, each going to its
 * Entries as in the Sidebar, and the Sections of Settings inside it: all of
 * them, or only `sections` where some are not shown.
 */
export const stopsFrom = (where: {
  readonly pathname: string;
  readonly tab?: string | undefined;
  readonly account?: string | undefined;
  readonly accounts: ReadonlyArray<Pick<Account, 'id' | 'name' | 'kind'>>;
  readonly sections?: ReadonlyArray<SectionId>;
}): {
  readonly tree: ReadonlyArray<Stop>;
  readonly start: ReadonlyArray<string>;
} => {
  const [, place = '', part = ''] = where.pathname.split('/');
  const under = underOf(place, part);
  const accounts: ReadonlyArray<Stop> = where.accounts.map((account) => ({
    id: account.id,
    label: account.name,
    icon: account.kind,
    account: account.id,
  }));
  const sections = SETTINGS_SECTIONS.filter(
    (section) => where.sections?.includes(section.id) ?? true,
  ).map((section): Stop => ({ ...section, icon: section.id }));
  const tree = PLACES.flatMap((each): ReadonlyArray<Stop> => {
    if (each.id === 'settings') {
      const settings = { ...stopOf(each), children: sections };
      if (accounts.length === 0) return [settings];
      const group: Stop = {
        id: 'accounts',
        label: 'Accounts',
        icon: 'accounts',
        children: accounts,
      };
      return [group, settings];
    }
    return each.to === `/${place}` && under
      ? [stopOf(each), under]
      : [stopOf(each)];
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

/** What the header calls the Place at `pathname`. */
export const placeTitle = (pathname: string): string => {
  const [, place, part] = pathname.split('/');
  if (place === 'entries') return part ? 'Entry' : 'Entries';
  if (place === 'months')
    return part && isMonthKey(part) ? monthName(part) : 'Months';
  if (place === 'settings') return 'Settings';
  return 'Home';
};
