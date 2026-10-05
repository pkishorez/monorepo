import { useRef } from 'react';
import { keys, quietly, THUMB } from '../../commands/index.ts';
import { useSettings } from '../../state/settings/index.ts';
import { play } from '../../kit/sound/index.ts';
import {
  type ThumbCommand,
  type ThumbFeedback,
  ThumbLock,
  type Way,
  WAYS,
} from '../../kit/thumb-lock/index.ts';

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
 * so a way works exactly where the key would. It sounds as it locks, arms,
 * runs and goes a Wrong Way, if the user wants gesture sounds, and a Wrong
 * Way shakes the screen. The Command it runs keeps its own sound and Key
 * Bar to itself: the Lift Hint has shown it already.
 */
export function Thumb() {
  const settings = useSettings();
  const { actions } = keys.useStatus();
  const run = keys.useRun();
  const sounds = useRef(settings.gestureSounds);
  sounds.current = settings.gestureSounds;
  // Each way's Command, named as the palette names it; a way with none
  // never works.
  const commands = Object.fromEntries(
    WAYS.map((way) => {
      const id = THUMB[way];
      const action = actions.find((each) => each.id === id);
      return [
        way,
        {
          label: action?.description ?? '',
          works: action?.state === 'active',
        },
      ];
    }),
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
      onCommand={(way) => {
        const id = THUMB[way];
        if (id) quietly(() => run(id));
      }}
      onFeedback={feedback}
      enabled={settings.gesturesOn}
    />
  );
}
