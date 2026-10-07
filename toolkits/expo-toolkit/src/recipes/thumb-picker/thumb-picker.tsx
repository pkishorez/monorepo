import { thumbLock, TreeWalk } from '@kstackz/use-gesture';
import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useWorkletGesture } from '../../input';
import type { Choice } from './choice';
import { Menu } from './menu';
import { createPicking, type Ground } from './picking';
import { HIDDEN, shapeOf, type View, viewOf } from './view';

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
 *
 * The Lock and the walk run on the UI thread, and the menu, drawn up front
 * for the tree, moves from shared values there, so a Step shows in the
 * frame the finger makes it, however busy the JS thread is. Only what is
 * told, and what is chosen, crosses to the JS thread, and nothing waits for
 * it. Keep `tree` the same object while it means the same choices.
 */
export function ThumbPicker(props: Props) {
  const { tree, start, reveal, step } = props;
  const lists = useMemo(() => TreeWalk.lists(tree, start), [tree, start]);
  // What the UI thread walks: the tree's shape, where it began, distances.
  const shape = useMemo(() => shapeOf(tree), [tree]);
  const ground = useSharedValue<Ground>(groundOf(shape, start, reveal, step));
  useEffect(() => {
    ground.value = groundOf(shape, start, reveal, step);
  }, [ground, shape, start, reveal, step]);

  const enabled = useSharedValue(props.enabled !== false);
  useEffect(() => {
    enabled.value = props.enabled !== false;
  }, [enabled, props.enabled]);
  const { width: screen } = useWindowDimensions();
  const width = useSharedValue(screen);
  useEffect(() => {
    width.value = screen;
  }, [width, screen]);
  const reading = useScreenReader();

  const view = useSharedValue<View>(HIDDEN);
  // How many Wrong Ways the menu has shaken for.
  const shakes = useSharedValue(0);

  // What the UI thread hands back: read through the latest props, so a
  // change of tree or feedback needs no new listener.
  const latest = useRef(props);
  latest.current = props;
  const told = useMemo(
    () => ({
      feedback: (feedback: 'lock' | TreeWalk.Event) =>
        latest.current.onFeedback?.(feedback),
      choose: (path: ReadonlyArray<number>) =>
        TreeWalk.choiceAt(latest.current.tree, path)?.onSelect?.(),
      announce: (path: ReadonlyArray<number>) => {
        const marked = TreeWalk.choiceAt(latest.current.tree, path);
        if (marked) AccessibilityInfo.announceForAccessibility(marked.label);
      },
    }),
    [],
  );

  useWorkletGesture((claim) => {
    'worklet';
    const { feedback, choose, announce } = told;
    const picking = createPicking(() => ground.value, {
      show: (walk) => {
        const before = view.value;
        const { tree: now, start: from } = ground.value;
        view.value = viewOf(walk, now, from, before);
        // A screen reader hears the marked choice as it changes.
        if (reading.value && walk?.shown) {
          const last = view.value.open[view.value.open.length - 1];
          const was = before.open[before.open.length - 1];
          if (last?.id !== was?.id || last?.marked !== was?.marked) {
            scheduleOnRN(announce, walk.path);
          }
        }
      },
      feedback: (event) => scheduleOnRN(feedback, event),
      shake: () => {
        shakes.value += 1;
      },
      choose: (path) => scheduleOnRN(choose, path),
    });
    return thumbLock<null>({
      enabled: () => enabled.value,
      width: () => width.value,
      onLock: () => {
        claim();
        picking.lock();
      },
      onMove: picking.move,
      onEnd: picking.end,
    });
  });

  return <Menu lists={lists} view={view} shakes={shakes} />;
}

const groundOf = (
  tree: Ground['tree'],
  start: ReadonlyArray<string>,
  reveal: number | undefined,
  step: number | undefined,
): Ground => ({
  tree,
  start,
  reveal: reveal ?? TreeWalk.DISTANCES.reveal,
  step: step ?? TreeWalk.DISTANCES.step,
});

// Whether a screen reader is on, for the UI thread to read.
const useScreenReader = () => {
  const reading = useSharedValue(false);
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      reading.value = on;
    });
    const change = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (on: boolean) => {
        reading.value = on;
      },
    );
    return () => change.remove();
  }, [reading]);
  return reading;
};
