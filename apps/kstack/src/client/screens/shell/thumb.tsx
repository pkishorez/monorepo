import { useLocation } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { keys, quietly } from '../../commands/index.ts';
import { useSettings } from '../../state/settings/index.ts';
import { pick, PlacePicker } from '../../kit/place-picker/index.ts';
import { play } from '../../kit/sound/index.ts';
import { type ThumbFeedback, ThumbLock } from '../../kit/thumb-lock/index.ts';
import { PLACES, stepsFrom } from './places.ts';

// How far, in px, a Thumb Lock swipe goes to take its first Step.
const FIRST = 72;

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

type Stepped = ReturnType<typeof pick> & {
  /** The Lift Hint has grown into the Place Picker, until the finger lifts. */
  readonly list: boolean;
};

// Something shows once the first Step is taken, and the Place Picker stays
// until the finger lifts.
const showing = (stepped: Stepped) => stepped.steps !== 0 || stepped.list;

/**
 * The Thumb Lock of every Place: up and down Step through the Place order,
 * and lifting Goes to the Place reached, through the same Action as its
 * key, so it works exactly where the key would. The first Step comes as
 * the swipe arms, so a flick goes to the next or previous Place; from the
 * second, the Lift Hint grows into the Place Picker. Past either end, or
 * sideways, is a Wrong Way: the screen shakes. It sounds as it locks, arms,
 * Steps, goes and goes wrong, if the user wants gesture sounds, and buzzes
 * where it can. The Go it gives keeps its own sound and Key Bar to itself:
 * the Lift Hint has shown it already.
 */
export function Thumb() {
  const settings = useSettings();
  const { actions } = keys.useStatus();
  const run = keys.useRun();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { items, start } = stepsFrom(pathname);
  const [shown, setShown] = useState<Stepped>();
  // What is shown as the swipe moves, ahead of the next render.
  const stepped = useRef<Stepped>(undefined);
  const sounds = settings.gestureSounds;
  // Go works here, as its keys do, or every way is a Wrong Way.
  const going = PLACES.every(
    (place) =>
      actions.find((action) => action.id === place.command)?.state === 'active',
  );

  const still: Stepped = { steps: 0, index: start, past: false, list: false };

  const show = (next: Stepped | undefined) => {
    stepped.current = next;
    setShown(next);
  };

  const wrong = () => {
    if (sounds) play('wrong');
    buzz([14, 40, 14]);
    shake();
  };

  const feedback = (kind: ThumbFeedback) => {
    if (kind === 'lock' && sounds) play('tick');
    if (kind === 'wrong') {
      show(undefined);
      wrong();
    }
  };

  const move = (travel: number) => {
    const before = stepped.current ?? still;
    const now = pick({ count: items.length, start, travel, first: FIRST });
    const next = { ...now, list: before.list || Math.abs(now.steps) >= 2 };
    if (
      next.steps === before.steps &&
      next.index === before.index &&
      next.list === before.list
    )
      return;
    if (!showing(before) && showing(next)) {
      if (sounds) play('arm');
      buzz(8);
    } else if (showing(next) && next.index !== before.index) {
      if (sounds) play('tick');
      buzz(4);
    }
    show(next);
  };

  const lift = (travel: number | undefined) => {
    show(undefined);
    if (travel === undefined) return;
    const { steps, index, past } = pick({
      count: items.length,
      start,
      travel,
      first: FIRST,
    });
    if (steps === 0) return;
    if (past) return wrong();
    const place = items[index];
    if (place === undefined || !('command' in place)) return;
    if (sounds) play('success');
    quietly(() => run(place.command));
  };

  const marked = shown && showing(shown) ? items[shown.index]?.id : undefined;

  return (
    <>
      <ThumbLock
        works={{ up: going, down: going, left: false, right: false }}
        onSwipe={(swipe) => move(swipe?.dy ?? 0)}
        onLift={(swipe) => lift(swipe?.dy)}
        onFeedback={feedback}
        enabled={settings.gesturesOn}
      />
      <PlacePicker
        items={items}
        start={items[start]?.id ?? ''}
        marked={marked}
        past={shown?.past ?? false}
        list={shown?.list ?? false}
      />
    </>
  );
}
