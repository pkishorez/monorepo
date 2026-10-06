import { useRef, useState } from 'react';
import { useThumbLock } from './lock.ts';
import { type Column, Menu } from './menu.tsx';
import { type Choice, idsAlong, listsAlong } from './tree.ts';
import { begin, chosen, type Event, move, pathOf, type Walk } from './walk.ts';

export type { Choice } from './tree.ts';

/** How far, in px, the finger goes before a swipe shows anything. */
const ARM = 14;

// Each list the walk has opened, with what is marked in it and, on the
// way to where the swipe began, where you are.
const columnsOf = (
  walk: Walk,
  tree: ReadonlyArray<Choice>,
  start: ReadonlyArray<string>,
): ReadonlyArray<Column> => {
  const path = pathOf(walk);
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
 * still while another finger swipes. Nothing shows until the finger has
 * moved; then the choices show over everything else, dimmed and blurred,
 * starting on the one `start` names. Up and down Step through a list;
 * right opens the marked choice's own choices, starting on the one last
 * marked there in this swipe, and left goes back. Lifting chooses the
 * marked choice, unless it is where the swipe began or on the way to it.
 * Each Lock, Step, opening, going back and Wrong Way is told, for sound
 * and touch to follow.
 */
export function ThumbPicker(props: {
  readonly tree: ReadonlyArray<Choice>;
  /** The ids of the choices the swipe begins at, top to bottom. */
  readonly start: ReadonlyArray<string>;
  readonly onFeedback?: (feedback: 'lock' | Event) => void;
  readonly enabled?: boolean;
}) {
  const [walk, setWalk] = useState<Walk>();
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
    onLock: () => latest.current.onFeedback?.('lock'),
    onMove: (finger) => {
      const { tree, start, onFeedback } = latest.current;
      const armed = Math.hypot(finger.x, finger.y) >= ARM;
      const before =
        walking.current ?? (armed ? begin(tree, start) : undefined);
      if (before === undefined) return;
      const after = move(before, tree, start, finger);
      if (after.event !== undefined) onFeedback?.(after.event);
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
      columns={
        walk === undefined
          ? undefined
          : columnsOf(walk, props.tree, props.start)
      }
    />
  );
}
