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

/**
 * The Thumb Lock of every Place: up and down Step through the Place order,
 * and lifting Goes to the Place reached, through the same Action as its
 * key. The Place Picker shows as soon as the swipe goes up or down; the
 * first Step comes as the swipe arms, so a flick goes to the next or
 * previous Place; past either end it holds there. Sideways is a Wrong
 * Way: the screen shakes. It sounds as it locks, Steps, goes and goes
 * wrong, if the user wants gesture sounds, and buzzes where it can. The Go it gives keeps its
 * own sound and Key Bar to itself: the Place Picker has shown it already.
 */
export function Thumb() {
  const settings = useSettings();
  const { actions } = keys.useStatus();
  const run = keys.useRun();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { items, start } = stepsFrom(pathname);
  const [shown, setShown] = useState<number>();
  // What is shown as the swipe moves, ahead of the next render.
  const stepped = useRef<number>(undefined);
  const sounds = settings.gestureSounds;
  // A Go whose keys another Surface shadows here still runs for a finger.
  const goes = (command: string) => {
    const state = actions.find((action) => action.id === command)?.state;
    return state === 'active' || state === 'shadowed';
  };
  const going = PLACES.some((place) => goes(place.command));

  const at = (travel: number) =>
    pick({ count: items.length, start, travel, first: FIRST });

  const show = (next: number | undefined) => {
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
    const before = stepped.current;
    const next = at(travel);
    if (next === before) return;
    if (before !== undefined) {
      if (sounds) play('tick');
      buzz(4);
    }
    show(next);
  };

  const lift = (travel: number | undefined) => {
    show(undefined);
    if (travel === undefined) return;
    const index = at(travel);
    const place = items[index];
    if (index === start || place === undefined || !('command' in place)) return;
    if (!goes(place.command)) return wrong();
    if (sounds) play('success');
    quietly(() => run(place.command));
  };

  return (
    <>
      <ThumbLock
        works={{ up: going, down: going, left: false, right: false }}
        onSwipe={(swipe) => (swipe ? move(swipe.dy) : show(undefined))}
        onLift={(swipe) => lift(swipe?.dy)}
        onFeedback={feedback}
        enabled={settings.gesturesOn}
      />
      <PlacePicker
        items={items}
        start={items[start]?.id ?? ''}
        marked={shown === undefined ? undefined : items[shown]?.id}
      />
    </>
  );
}
