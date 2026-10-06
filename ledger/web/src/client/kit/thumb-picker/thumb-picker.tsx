import { useRef, useState } from 'react';
import { useThumbLock } from './lock.ts';
import { type Column, Menu } from './menu.tsx';
import { type Choice, idsAlong, listsAlong } from './tree.ts';
import {
  begin,
  chosen,
  DISTANCES,
  type Event,
  move,
  type Walk,
} from './walk.ts';

export type { Choice } from './tree.ts';

// Each list the walk has opened, with what is marked in it and, on the
// way to where the swipe began, where you are.
const columnsOf = (
  walk: Walk,
  tree: ReadonlyArray<Choice>,
  start: ReadonlyArray<string>,
): ReadonlyArray<Column> => {
  const { path } = walk;
  const ids = idsAlong(tree, path);
  return listsAlong(tree, path).map((choices, depth) => {
    const onStart = ids.slice(0, depth).every((id, at) => id === start[at]);
    const here = choices.findIndex((choice) => choice.id === start[depth]);
    return {
      id: ids.slice(0, depth).join('/'),
      choices,
      marked: path[depth] ?? 0,
      here: onStart && here >= 0 ? here : undefined,
    };
  });
};

/**
 * A Thumb Lock that picks from a tree of choices: the left thumb resting
 * still while another finger swipes. The walk starts on the choice `start`
 * names; nothing shows until the finger has gone `reveal` px, then the
 * choices show over everything else, dimmed and blurred. Each `step` px
 * the finger goes from where it last moved something makes one move. Up and down Step
 * through a list; right opens the marked choice's own choices, starting
 * on the one last marked there in this swipe, and left goes back. Lifting
 * the finger chooses the marked choice, unless it is where the swipe began
 * or on the way to it; lifting the thumb first chooses nothing. A Wrong
 * Way shakes the menu. Each Lock, Step, opening, going back and Wrong Way
 * is told, for sound
 * and touch to follow.
 */
export function ThumbPicker(props: {
  readonly tree: ReadonlyArray<Choice>;
  /** The ids of the choices the swipe begins at, top to bottom. */
  readonly start: ReadonlyArray<string>;
  readonly onFeedback?: (feedback: 'lock' | Event) => void;
  readonly enabled?: boolean;
  /** How far, in px, the finger goes before anything shows: 14 unless told. */
  readonly reveal?: number;
  /** How far, in px, the finger goes for each move: 30 unless told. */
  readonly step?: number;
}) {
  const [walk, setWalk] = useState<Walk>();
  // How many Wrong Ways the menu has shaken for.
  const [shakes, setShakes] = useState(0);
  // The walk as the finger left it, ahead of the next render.
  const walking = useRef<Walk>(undefined);
  const latest = useRef(props);
  latest.current = props;

  const show = (next: Walk | undefined) => {
    walking.current = next;
    setWalk(next);
  };

  useThumbLock({
    enabled: props.enabled !== false,
    onLock: () => {
      const { tree, start, onFeedback } = latest.current;
      show(begin(tree, start));
      onFeedback?.('lock');
    },
    onMove: (finger) => {
      const { tree, start, onFeedback, reveal, step } = latest.current;
      if (walking.current === undefined) return;
      const after = move(walking.current, tree, start, finger, {
        reveal: reveal ?? DISTANCES.reveal,
        step: step ?? DISTANCES.step,
      });
      for (const event of after.events) onFeedback?.(event);
      if (after.events.includes('wrong')) setShakes((count) => count + 1);
      if (after.walk !== walking.current) show(after.walk);
    },
    onEnd: (lifted) => {
      const last = walking.current;
      show(undefined);
      if (!lifted || last === undefined) return;
      const { tree, start } = latest.current;
      chosen(last, tree, start)?.onSelect?.();
    },
  });

  return (
    <Menu
      shakes={shakes}
      columns={
        walk === undefined || !walk.shown
          ? undefined
          : columnsOf(walk, props.tree, props.start)
      }
    />
  );
}
