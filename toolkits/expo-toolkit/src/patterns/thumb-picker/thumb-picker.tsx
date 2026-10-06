import { thumbLock, TreeWalk } from '@kstackz/use-gesture';
import { useMemo, useRef, useState } from 'react';
import { Dimensions } from 'react-native';
import { useGesture } from '../../input';
import type { Choice } from './choice';
import { Menu } from './menu';
import { createPicking } from './picking';

export type { Choice } from './choice';

type Props = {
  readonly tree: ReadonlyArray<Choice>;
  /** The ids of the choices the swipe begins at, top to bottom. */
  readonly start: ReadonlyArray<string>;
  readonly onFeedback?: (feedback: 'lock' | TreeWalk.Event) => void;
  readonly enabled?: boolean;
  /** How far, in points, the finger goes before anything shows: 14 unless told. */
  readonly reveal?: number;
  /** How far, in points, the finger goes for each move: 30 unless told. */
  readonly step?: number;
};

/**
 * A Thumb Lock that picks from a tree of choices, inside a GestureSurface:
 * the left thumb resting still while another finger swipes. The walk starts
 * on the choice `start` names; nothing shows until the finger has gone
 * `reveal` points, then the choices show over everything else, dimmed and
 * blurred. Each `step` points the finger goes from where it last moved
 * something makes one move. Up and down Step through a list; right opens
 * the marked choice's own choices, starting on the one last marked there in
 * this swipe, and left goes back. Lifting the finger chooses the marked
 * choice, unless it is where the swipe began or on the way to it; lifting
 * the thumb first chooses nothing. A Wrong Way shakes the menu. Each Lock,
 * Step, opening, going back and Wrong Way is told, for sound and touch to
 * follow. Once the Lock holds, the touch is its own: nothing under the
 * fingers scrolls or presses. Draw it last inside the surface, so it covers
 * what the surface holds.
 */
export function ThumbPicker(props: Props) {
  const [walk, setWalk] = useState<TreeWalk.Walk>();
  // How many Wrong Ways the menu has shaken for.
  const [shakes, setShakes] = useState(0);
  const latest = useRef(props);
  latest.current = props;
  const claim = useRef<() => void>(() => {});

  const listener = useMemo(() => {
    const picking = createPicking(() => latest.current, {
      show: setWalk,
      feedback: (feedback) => latest.current.onFeedback?.(feedback),
      shake: () => setShakes((count) => count + 1),
    });
    return thumbLock({
      enabled: () => latest.current.enabled !== false,
      width: () => Dimensions.get('window').width,
      onLock: () => {
        claim.current();
        picking.lock();
      },
      onMove: picking.move,
      onEnd: picking.end,
    });
  }, []);
  claim.current = useGesture(listener).claim;

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
