import type { AnyNode } from '../node/index.ts';
import { destroy, handle, plant } from '../tree/index.ts';
import type { Handle, Instance, Sent } from '../tree/index.ts';

/*
 * The tree as it was at any Time, rebuilt from the Messages alone: init and
 * Update run, nothing else does. No Services, no Lifetimes, no Commands, and
 * every send is dropped.
 *
 * 1. Plant    a fresh root, exactly as the app started. Instances are numbered
 *             as they are created, in the same order as they were live.
 * 2. Play     each Message with its Time: hand it to the Instance with its
 *             number. One that is gone drops it, as it did live.
 * 3. Seek     to a Time plays every Message sent by then. Forward plays only
 *             the new ones; back plants again.
 */

/** A tree that can be moved to any Time of a list of Messages. */
export interface Replay<N> {
  /** The root as it was at Time `at`: every Message sent by then handled. 0 is right after init. */
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
  const play = ({ id, message, at }: Sent) => {
    const instance = instances[id];
    if (instance) handle(instance, message, at);
  };

  // 3. Seek
  const seek = (at: number): Handle<N> => {
    const messages = sent();
    const past = played > 0 && messages[played - 1]!.at > at;
    const tree = !root || past ? replant() : root;
    for (; played < messages.length && messages[played]!.at <= at; played++) {
      play(messages[played]!);
    }
    return tree as unknown as Handle<N>;
  };

  return { seek };
};

export const Replay = { make };
