import { GestureSurface } from '@kstackz/expo-toolkit/input';
import { SidebarEdge } from '@kstackz/expo-toolkit/patterns/sidebar';
import {
  type Choice,
  ThumbPicker,
} from '@kstackz/expo-toolkit/patterns/thumb-picker';
import { type ActionId, keys, quietly } from '@ledger/core/client/commands';
import { PLACES, type Stop, stopsFrom } from '@ledger/core/client/places';
import { useMoney } from '@ledger/core/client/session';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { feelGesture, useSettings } from '../../ledger';
import { StopIcon } from '../parts';

/**
 * Where Ledger's gestures are heard: the header and the Place, with the
 * Thumb Lock over them and the Sidebar's edge beside them. In development
 * a script can touch it by hand as `globalThis.__touches.ledger`
 * (scripts/touch.mjs).
 */
export function GestureLayer(props: { readonly children: ReactNode }) {
  const settings = useSettings();
  return (
    <GestureSurface devName="ledger">
      {props.children}
      <SidebarEdge enabled={settings.gesturesOn} />
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
 * sounded it already.
 */
function Thumb() {
  const settings = useSettings();
  const { actions } = keys.useStatus();
  const run = keys.useRun();
  const router = useRouter();
  const money = useMoney();
  const pathname = usePathname();
  const search = useGlobalSearchParams<{ tab?: string; account?: string }>();
  const { tree, start } = stopsFrom({
    pathname,
    tab: search.tab,
    account: search.account,
    accounts: money.accounts,
    sections: SECTIONS,
  });
  const on = { sound: settings.sound, haptics: settings.haptics };
  // A Go whose keys another Surface shadows here still runs for a finger.
  const goes = (command: ActionId) => {
    const state = actions.find((action) => action.id === command)?.state;
    return state === 'active' || state === 'shadowed';
  };
  const going = PLACES.some((place) => goes(place.command));

  const go = (stop: Stop) => () => {
    const { command, account } = stop;
    if (command !== undefined && !goes(command)) return;
    feelGesture('go', on);
    if (command !== undefined) quietly(() => run(command));
    else router.navigate({ pathname: '/entries', params: { account } });
  };

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
        ? go(stop)
        : undefined,
    children: stop.children?.map(choiceOf),
  });

  return (
    <ThumbPicker
      tree={tree.map(choiceOf)}
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
