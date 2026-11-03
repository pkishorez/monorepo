import { Effect, Queue, Stream } from 'effect';
import {
  isNotification,
  type BackgroundTerminal,
  type Notification,
} from '../app-server/index.js';

/** How much of what a command wrote is kept, from its end. */
export const KEPT_CHARS = 64 * 1024;

interface Written {
  /** What it wrote, piece by piece, the oldest dropped once the rest are `KEPT_CHARS`. */
  readonly pieces: Array<string>;
  /** How long the pieces are, together. */
  size: number;
  /** Its item has completed: it is dropped once no background terminal runs it. */
  completed: boolean;
  readonly readers: Set<(piece: string) => void>;
}

/**
 * What each command a thread runs has written, by its item id, from its
 * `item/commandExecution/outputDelta`s, so a background terminal's output
 * can be read from its start however late it is asked for. A command is
 * forgotten once its item has completed and no background terminal runs it.
 */
export interface Outputs {
  /** Learns from one notification of the thread's. */
  readonly observe: (notification: Notification) => void;
  /** Forgets the completed commands no terminal runs now. */
  readonly prune: (terminals: ReadonlyArray<BackgroundTerminal>) => void;
  /** What the command wrote, then each piece as it comes, until `ended`. */
  readonly follow: (
    itemId: string,
    ended: Effect.Effect<void>,
  ) => Stream.Stream<string>;
}

/** Adds a piece, and drops the oldest no longer needed for the last `KEPT_CHARS`. */
const add = (each: Written, piece: string) => {
  each.pieces.push(piece);
  each.size += piece.length;
  while (
    each.pieces.length > 1 &&
    each.size - each.pieces[0]!.length >= KEPT_CHARS
  )
    each.size -= each.pieces.shift()!.length;
};

/** What it wrote, its last `KEPT_CHARS`. */
const textOf = (each: Written) => {
  const text = each.pieces.join('');
  return text.length <= KEPT_CHARS
    ? text
    : text.slice(text.length - KEPT_CHARS);
};

export const makeOutputs = (): Outputs => {
  const written = new Map<string, Written>();
  const of = (itemId: string) => {
    let found = written.get(itemId);
    if (found === undefined) {
      found = { pieces: [], size: 0, completed: false, readers: new Set() };
      written.set(itemId, found);
    }
    return found;
  };
  return {
    observe: (notification) => {
      if (isNotification(notification, 'item/commandExecution/outputDelta')) {
        const { itemId, delta } = notification.params;
        const each = of(itemId);
        add(each, delta);
        for (const read of each.readers) read(delta);
        return;
      }
      if (
        isNotification(notification, 'item/completed') &&
        notification.params.item.type === 'commandExecution'
      ) {
        const each = written.get(notification.params.item.id);
        if (each !== undefined) each.completed = true;
      }
    },
    prune: (terminals) => {
      const running = new Set(terminals.map((terminal) => terminal.itemId));
      for (const [itemId, each] of written)
        if (each.completed && !running.has(itemId) && each.readers.size === 0)
          written.delete(itemId);
    },
    follow: (itemId, ended) =>
      Stream.callback<string>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const each = of(itemId);
            if (each.size > 0) Queue.offerUnsafe(queue, textOf(each));
            const read = (piece: string) => Queue.offerUnsafe(queue, piece);
            each.readers.add(read);
            return () => {
              each.readers.delete(read);
              // Followed before it wrote, and never did: nothing to keep.
              if (each.readers.size === 0 && each.size === 0)
                written.delete(itemId);
            };
          }),
          (stop) => Effect.sync(stop),
        ).pipe(Effect.andThen(ended), Effect.andThen(Queue.end(queue))),
      ),
  };
};
