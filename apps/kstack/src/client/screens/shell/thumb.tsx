import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { type ActionId, keys, quietly } from '../../commands/index.ts';
import { useSettings } from '../../state/settings/index.ts';
import { useMoney } from '../../state/session/index.ts';
import { play } from '../../kit/sound/index.ts';
import { type Choice, ThumbPicker } from '../../kit/thumb-picker/index.ts';
import { PLACES, type Stop, stopsFrom } from './places.ts';

const buzz = (pattern: number | ReadonlyArray<number>) =>
  navigator.vibrate?.(pattern as number[]);

// A Wrong Way shakes the whole screen, once, unless motion is unwanted.
const shake = () => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelector('[data-slot=app-shell]')?.animate(
    {
      transform: [0, -6, 5, -3, 2, 0].map((x) => `translateX(${x}px)`),
    },
    { duration: 320, easing: 'ease-out' },
  );
};

/**
 * The Thumb Lock of every Place: the Thumb Picker over the Places, the
 * Accounts and the Sections of Settings. Lifting on a Place or a Section
 * Goes there through the same Action as its key; on an Account, to its
 * Entries, as the Sidebar does. It sounds as it locks, Steps, opens, goes
 * back, goes and goes wrong, if the user wants sounds, and buzzes where it
 * can. The Go it gives keeps its own sound and Key Bar to itself: the
 * picker has shown it already.
 */
export function Thumb() {
  const settings = useSettings();
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

  const wrong = () => {
    if (sounds) play('wrong');
    buzz([14, 40, 14]);
    shake();
  };

  const go = (stop: Stop) => () => {
    const { command, account } = stop;
    if (command !== undefined && !goes(command)) return wrong();
    if (sounds) play('success');
    if (command !== undefined) quietly(() => run(command));
    else void navigate({ to: '/entries', search: { account } });
  };

  const choiceOf = (stop: Stop): Choice => ({
    id: stop.id,
    label: stop.label,
    icon: stop.icon,
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
        if (feedback === 'wrong') return wrong();
        if (sounds) play('tick');
        if (feedback !== 'lock') buzz(4);
      }}
      enabled={settings.gesturesOn && going}
    />
  );
}
