import { type Finger, TreeWalk } from '@kstackz/use-gesture';
import type { Choice } from './choice';

/** What a picking is walking now: the tree, where it began, its distances. */
type Ground = {
  readonly tree: ReadonlyArray<Choice>;
  readonly start: ReadonlyArray<string>;
  readonly reveal?: number;
  readonly step?: number;
};

/** What the picker hears from a Thumb Lock, and tells as it walks. */
type Telling = {
  /** The walk to draw, or none once it is over. */
  readonly show: (walk: TreeWalk.Walk | undefined) => void;
  readonly feedback: (feedback: 'lock' | TreeWalk.Event) => void;
  /** A Wrong Way: the menu shakes once. */
  readonly shake: () => void;
};

/**
 * One Thumb Lock's picking, with no UI: the Lock begins a Tree Walk on the
 * choice the swipe starts at, each move of the finger walks it on and tells
 * what it did, and the end chooses the marked choice if the finger lifted
 * first. `ground` is read afresh at each step, so the tree may change while
 * nothing is under way.
 */
export const createPicking = (ground: () => Ground, tell: Telling) => {
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
      const after = TreeWalk.move(walk, tree, start, finger, {
        reveal: reveal ?? TreeWalk.DISTANCES.reveal,
        step: step ?? TreeWalk.DISTANCES.step,
      });
      for (const event of after.events) tell.feedback(event);
      if (after.events.includes('wrong')) tell.shake();
      if (after.walk !== walk) show(after.walk);
    },
    end: (lifted: boolean) => {
      const last = walk;
      show(undefined);
      if (!lifted || last === undefined) return;
      const { tree, start } = ground();
      TreeWalk.chosen(last, tree, start)?.onSelect?.();
    },
  };
};
