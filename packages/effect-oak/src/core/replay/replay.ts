import type { AnyNode } from '../node/index.ts';
import { destroy, handle, plant } from '../tree/index.ts';
import type { Handle, Instance } from '../tree/index.ts';
import type { Entry } from '../log/index.ts';

/*
 * The tree as it was right after any Log entry, rebuilt from the Messages
 * alone: init and Update run, nothing else does. No Services, no Lifetimes,
 * no Commands, and every send is dropped.
 *
 * 1. Plant    a fresh root, exactly as the app started. Instances are numbered
 *             as they are created, in the same order as they were live.
 * 2. Play     each Message with its Time: hand it to the Instance with its
 *             number. One that is gone drops it, as it did live.
 * 3. Seek     to the last entry of a Branch plays the Branch. Further down the
 *             Branch already played plays only the new entries; anywhere else
 *             plants again.
 */

/** A tree that can be moved to any entry of the Log. */
export interface Replay<N> {
  /** The root right after the last entry of `branch`, the path of entries from the first to it. */
  readonly seek: (branch: ReadonlyArray<Entry>) => Handle<N>;
}

// 1. Plant
const replant = (node: AnyNode) => {
  const instances: Array<Instance> = [];
  const root = plant(node, {
    send: () => {},
    created: (instance) => {
      instances[instance.id] = instance;
    },
  });
  return { root, instances };
};

// 2. Play
/**
 * A dropped Message changed nothing, and the number it carries may belong to
 * an Instance of a tree the Runtime has since left (a fork), so it is skipped.
 */
const play = (instances: ReadonlyArray<Instance>, entry: Entry) => {
  const instance = instances[entry.instance];
  if (instance && entry.outcome !== 'dropped')
    handle(instance, entry.message, entry.at);
};

// 3. Seek
const make = <N extends AnyNode>(node: N): Replay<N> => {
  let tree: ReturnType<typeof replant> | undefined;
  let played: ReadonlyArray<Entry> = [];

  const seek = (branch: ReadonlyArray<Entry>): Handle<N> => {
    const last = played.at(-1);
    const further =
      tree &&
      played.length <= branch.length &&
      (last === undefined || branch[played.length - 1]?.id === last.id);
    if (!further) {
      if (tree) destroy(tree.root);
      tree = replant(node);
      played = [];
    }
    for (const entry of branch.slice(played.length))
      play(tree!.instances, entry);
    played = branch;
    return tree!.root as unknown as Handle<N>;
  };

  return { seek };
};

export const Replay = { make };

/**
 * The tree right after the last entry of `branch`, to hand to the live
 * Runtime: its Instances keep their numbers, and it goes on numbering from
 * there.
 */
export const rebuild = (
  node: AnyNode,
  branch: ReadonlyArray<Entry>,
): Instance => {
  const { root, instances } = replant(node);
  for (const entry of branch) play(instances, entry);
  return root;
};
