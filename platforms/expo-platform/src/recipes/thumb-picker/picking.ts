import { type Finger, TreeWalk } from '@kstackz/use-gesture';
import type { Shape } from './view';

/** What a picking is walking now: the tree's shape, where it began, its distances. */
export type Ground = {
  readonly tree: ReadonlyArray<Shape>;
  readonly start: ReadonlyArray<string>;
  readonly reveal: number;
  readonly step: number;
};

/** What the picker hears from a Thumb Lock, and tells as it walks. */
type Telling = {
  /** The walk to draw, or none once it is over. */
  readonly show: (walk: TreeWalk.Walk | undefined) => void;
  readonly feedback: (feedback: 'lock' | TreeWalk.Event) => void;
  /** A Wrong Way: the menu shakes once. */
  readonly shake: () => void;
  /** Lifting chose the choice at `path`, a path of indices from the top. */
  readonly choose: (path: ReadonlyArray<number>) => void;
};

/**
 * One Thumb Lock's picking, with no UI: the Lock begins a Tree Walk on the
 * choice the swipe starts at, each move of the finger walks it on and tells
 * what it did, and the end chooses the marked choice if the finger lifted
 * first. `ground` is read afresh at each step, so the tree may change while
 * nothing is under way. A worklet, as the Tree Walk is: a phone picks on
 * its UI thread, and tells the JS thread only what it chose.
 */
export const createPicking = (ground: () => Ground, tell: Telling) => {
  'worklet';
  let walk: TreeWalk.Walk | undefined;

  const show = (next: TreeWalk.Walk | undefined) => {
    walk = next;
    tell.show(next);
  };

  return {
    lock: () => {
      const { tree, start } = ground();
      show(TreeWalk.begin(tree, start));
      tell.feedback('lock');
    },
    move: (finger: Finger) => {
      if (walk === undefined) return;
      const { tree, start, reveal, step } = ground();
      const after = TreeWalk.move(walk, tree, start, finger, { reveal, step });
      for (const event of after.events) tell.feedback(event);
      if (after.events.includes('wrong')) tell.shake();
      if (after.walk !== walk) show(after.walk);
    },
    end: (lifted: boolean) => {
      const last = walk;
      show(undefined);
      if (!lifted || last === undefined) return;
      const { tree, start } = ground();
      if (TreeWalk.chosen(last, tree, start) !== undefined) {
        tell.choose(last.path);
      }
    },
  };
};
