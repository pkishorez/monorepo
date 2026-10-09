import type { AnyNode } from '../node/index.ts';
import { destroy, handle, plant } from '../tree/index.ts';
import type { Handle, Instance, Sent } from '../tree/index.ts';

/*
 * The tree as it was after any number of Messages, rebuilt from the Messages
 * alone: init and Update run, nothing else does. No Services, no Lifetimes,
 * no Commands, and every send is dropped.
 *
 * 1. Plant    a fresh root, exactly as the app started. Instances are numbered
 *             as they are created, in the same order as they were live.
 * 2. Play     each Message: hand it to the Instance with its number. One that
 *             is gone drops it, as it did live.
 * 3. Seek     forward plays only the new Messages; back plants again.
 */

/** A tree that can be moved to any point of a list of Messages. */
export interface Replay<N> {
  /** The root as it was once the first `at` Messages were handled; 0 is right after init. */
  readonly seek: (at: number) => Handle<N>;
}

const make = <N extends AnyNode>(
  node: N,
  sent: () => ReadonlyArray<Sent>,
): Replay<N> => {
  let root: Instance | undefined;
  let instances: Array<Instance> = [];
  let played = 0;

  // 1. Plant
  const replant = (): Instance => {
    if (root) destroy(root);
    instances = [];
    played = 0;
    return (root = plant(node, {
      send: () => {},
      created: (instance) => {
        instances[instance.id] = instance;
      },
    }));
  };

  // 2. Play
  const play = ({ id, message }: Sent) => {
    const instance = instances[id];
    if (instance) handle(instance, message);
  };

  // 3. Seek
  const seek = (at: number): Handle<N> => {
    const tree = !root || at < played ? replant() : root;
    const messages = sent();
    for (const end = Math.min(at, messages.length); played < end; played++) {
      play(messages[played]!);
    }
    return tree as unknown as Handle<N>;
  };

  return { seek };
};

export const Replay = { make };
