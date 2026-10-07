import { GestureSurface } from '@kstackz/expo-toolkit/input';
import { SidebarSwipe } from '@kstackz/expo-toolkit/patterns/sidebar';
import {
  type Choice,
  ThumbPicker,
} from '@kstackz/expo-toolkit/patterns/thumb-picker';
import { type ActionId, keys, quietly } from '@ledger/core/client/commands';
import { PLACES, type Stop, stopsFrom } from '@ledger/core/client/places';
import { useMoney } from '@ledger/core/client/session';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { type ReactNode, useMemo, useRef } from 'react';
import { feelGesture, useSettings } from '../../ledger';
import { StopIcon } from '../parts';

/**
 * Where Ledger's gestures are heard: the header and the Place, with the
 * Thumb Lock over them and the Sidebar's swipe from anywhere, which the
 * Place's own zones (Settings' Sections, rows of pills) get first claim
 * before. The Sidebar's swipe works with the Thumb Lock switched off too,
 * as the switch's hint says, and as on the web.
 * In development a script can touch it by hand as
 * `globalThis.__touches.ledger` (scripts/touch.mjs).
 */
export function GestureLayer(props: { readonly children: ReactNode }) {
  return (
    <GestureSurface devName="ledger">
      {props.children}
      <SidebarSwipe />
      <Thumb />
    </GestureSurface>
  );
}

// A phone has no keyboard, so Settings has no Keys Section on it.
const SECTIONS = ['general', 'gestures'] as const;

/**
 * The Thumb Lock of every Place: the Thumb Picker over the Places, the
 * Accounts and the Sections of Settings. Lifting on a Place or a Section
 * Goes there through the same Action as its key; on an Account, to its
 * Entries, as the Sidebar does. Gesture Sounds and Gesture Haptics follow
 * their own settings as it locks, Steps and goes; a Wrong Way only shakes
 * the picker. The Go it gives keeps its own sound to itself: the picker has
 * sounded it already. Its tree is made again only when where you are or an
 * Account's name changes, not with every change of money or settings, so
 * the picker draws its menu again only then.
 */
function Thumb() {
  const settings = useSettings();
  const { actions } = keys.useStatus();
  const run = keys.useRun();
  const router = useRouter();
  const money = useMoney();
  const pathname = usePathname();
  const search = useGlobalSearchParams<{ tab?: string; account?: string }>();
  const on = { sound: settings.sound, haptics: settings.haptics };
  // A Go whose keys another Surface shadows here still runs for a finger.
  const goes = (command: ActionId) => {
    const state = actions.find((action) => action.id === command)?.state;
    return state === 'active' || state === 'shadowed';
  };
  const going = PLACES.some((place) => goes(place.command));

  // What lifting on a Stop does, read as it is chosen.
  const go = useRef((_stop: Stop) => {});
  go.current = (stop) => {
    const { command, account } = stop;
    if (command !== undefined && !goes(command)) return;
    feelGesture('go', on);
    if (command !== undefined) quietly(() => run(command));
    else router.navigate({ pathname: '/entries', params: { account } });
  };

  const named = useNamed(money.accounts);
  const { tab, account } = search;
  const { tree, start } = useMemo(() => {
    const stops = stopsFrom({
      pathname,
      tab,
      account,
      accounts: named,
      sections: SECTIONS,
    });
    const choiceOf = (stop: Stop): Choice => ({
      id: stop.id,
      label: stop.label,
      icon: ({ marked }) => (
        <StopIcon
          name={stop.icon}
          size={16}
          tone={marked ? 'foreground' : 'muted-foreground'}
        />
      ),
      onSelect:
        stop.command !== undefined || stop.account !== undefined
          ? () => go.current(stop)
          : undefined,
      children: stop.children?.map(choiceOf),
    });
    return { tree: stops.tree.map(choiceOf), start: stops.start };
  }, [pathname, tab, account, named]);

  return (
    <ThumbPicker
      tree={tree}
      start={start}
      onFeedback={(feedback) => {
        // A Wrong Way only shakes the picker.
        if (feedback === 'wrong') return;
        feelGesture(feedback === 'lock' ? 'lock' : 'step', on);
      }}
      enabled={settings.gesturesOn && going}
    />
  );
}

type Named = Pick<
  ReturnType<typeof useMoney>['accounts'][number],
  'id' | 'name' | 'kind'
>;

// The Accounts as the picker names them: a new array only when an id, a
// name or a kind changes, however often their money does.
const useNamed = (accounts: ReadonlyArray<Named>) => {
  const key = JSON.stringify(
    accounts.map(({ id, name, kind }) => [id, name, kind]),
  );
  return useMemo(
    (): ReadonlyArray<Named> =>
      (JSON.parse(key) as Array<[string, string, Named['kind']]>).map(
        ([id, name, kind]) => ({ id, name, kind }),
      ),
    [key],
  );
};
