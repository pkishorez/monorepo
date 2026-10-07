import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { type ActionId, keys, quietly } from '@ledger/core/commands';
import { useSettings } from '../../app.ts';
import { useMoney } from '@ledger/core/session';
import { play } from '@kstackz/web-platform/feedback';
import {
  type Choice,
  ThumbPicker,
} from '@kstackz/web-platform/recipes/thumb-picker';
import { PLACES, type Stop, stopsFrom } from '@ledger/core/places';
import { stopIcon } from '../parts/index.ts';

const buzz = (pattern: number | ReadonlyArray<number>) =>
  navigator.vibrate?.(pattern as number[]);

/**
 * The Thumb Lock of every Place: the Thumb Picker over the Places, the
 * Accounts and the Sections of Settings. Lifting on a Place or a Section
 * Goes there through the same Action as its key; on an Account, to its
 * Entries, as the Sidebar does. It sounds as it locks, Steps, opens, goes
 * back and goes, if the user wants sounds, and buzzes where it can; a
 * Wrong Way only shakes the picker. The Go it gives keeps its own sound and Key Bar to itself: the
 * picker has shown it already.
 */
export function Thumb() {
  const [settings] = useSettings();
  const { actions } = keys.useStatus();
  const run = keys.useRun();
  const navigate = useNavigate();
  const money = useMoney();
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useSearch({ strict: false }) as {
    tab?: string;
    account?: string;
  };
  const { tree, start } = stopsFrom({
    pathname,
    tab: search.tab,
    account: search.account,
    accounts: money.accounts,
  });
  const sounds = settings.sound;
  // A Go whose keys another Surface shadows here still runs for a finger.
  const goes = (command: ActionId) => {
    const state = actions.find((action) => action.id === command)?.state;
    return state === 'active' || state === 'shadowed';
  };
  const going = PLACES.some((place) => goes(place.command));

  const go = (stop: Stop) => () => {
    const { command, account } = stop;
    if (command !== undefined && !goes(command)) return;
    if (sounds) play('success');
    if (command !== undefined) quietly(() => run(command));
    else void navigate({ to: '/entries', search: { account } });
  };

  const choiceOf = (stop: Stop): Choice => ({
    id: stop.id,
    label: stop.label,
    icon: stopIcon(stop.icon),
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
        if (sounds) play('tick');
        if (feedback !== 'lock') buzz(4);
      }}
      enabled={settings.gesturesOn && going}
    />
  );
}
