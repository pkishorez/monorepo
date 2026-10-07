import { TreeWalk } from '@kstackz/use-gesture';
import { useRef, useState } from 'react';
import type { Choice } from './choice.ts';
import { useThumbLock } from './lock.ts';
import { Menu } from './menu.tsx';

export type { Choice } from './choice.ts';

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
  readonly onFeedback?: (feedback: 'lock' | TreeWalk.Event) => void;
  readonly enabled?: boolean;
  /** How far, in px, the finger goes before anything shows: 14 unless told. */
  readonly reveal?: number;
  /** How far, in px, the finger goes for each move: 30 unless told. */
  readonly step?: number;
}) {
  const [walk, setWalk] = useState<TreeWalk.Walk>();
  // How many Wrong Ways the menu has shaken for.
  const [shakes, setShakes] = useState(0);
  // The walk as the finger left it, ahead of the next render.
  const walking = useRef<TreeWalk.Walk>(undefined);
  const latest = useRef(props);
  latest.current = props;

  const show = (next: TreeWalk.Walk | undefined) => {
    walking.current = next;
    setWalk(next);
  };

  useThumbLock({
    enabled: props.enabled !== false,
    onLock: () => {
      const { tree, start, onFeedback } = latest.current;
      show(TreeWalk.begin(tree, start));
      onFeedback?.('lock');
    },
    onMove: (finger) => {
      const { tree, start, onFeedback, reveal, step } = latest.current;
      if (walking.current === undefined) return;
      const after = TreeWalk.move(walking.current, tree, start, finger, {
        reveal: reveal ?? TreeWalk.DISTANCES.reveal,
        step: step ?? TreeWalk.DISTANCES.step,
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
      TreeWalk.chosen(last, tree, start)?.onSelect?.();
    },
  });

  return (
    <Menu
      shakes={shakes}
      columns={
        walk === undefined || !walk.shown
          ? undefined
          : TreeWalk.columns(walk, props.tree, props.start)
      }
    />
  );
}
