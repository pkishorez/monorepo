import { useRef } from 'react';
import { keys, quietly, THUMB } from '../../commands/index.ts';
import { useMoney } from '../../client/data/index.ts';
import { play } from '../../kit/sound/index.ts';
import {
  type ThumbCommand,
  type ThumbFeedback,
  ThumbLock,
  type Way,
} from '../../kit/thumb-lock/index.ts';

// Short names for the arms; the Compass has little room.
const NAMES: Readonly<Record<Way, string>> = {
  down: 'Jump',
  up: 'Add',
  left: 'Next',
  right: 'Previous',
};

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
 * The Thumb Lock of every Place: each way runs the same Action as its key,
 * so an arm works exactly where the key would, and is faint where not. It
 * sounds as it locks, arms, runs and goes a Wrong Way, if the user wants
 * gesture sounds; the Command it runs then keeps its own sound to itself.
 */
export function Thumb() {
  const { preferences } = useMoney();
  const { actions } = keys.useStatus();
  const run = keys.useRun();
  const sounds = useRef(preferences.gestureSounds);
  sounds.current = preferences.gestureSounds;
  const works = (way: Way) =>
    actions.find((action) => action.id === THUMB[way])?.state === 'active';
  const commands = Object.fromEntries(
    (Object.keys(THUMB) as Way[]).map((way) => [
      way,
      { label: NAMES[way], works: works(way) },
    ]),
  ) as Record<Way, ThumbCommand>;

  const feedback = (kind: ThumbFeedback) => {
    const sound = sounds.current;
    if (kind === 'lock' && sound) play('tick');
    if (kind === 'arm') {
      if (sound) play('arm');
      buzz(8);
    }
    if (kind === 'run' && sound) play('success');
    if (kind === 'wrong') {
      if (sound) play('wrong');
      buzz([14, 40, 14]);
      shake();
    }
  };

  return (
    <ThumbLock
      commands={commands}
      onCommand={(way) => quietly(() => run(THUMB[way]))}
      onFeedback={feedback}
      enabled={preferences.gesturesOn !== false}
    />
  );
}
