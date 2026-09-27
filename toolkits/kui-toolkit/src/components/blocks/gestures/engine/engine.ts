import { type ActorOptions, createActor, type SnapshotFrom } from 'xstate';
import { gestureMachine } from './machine';
import { createPointerTracker } from './pointers';
import type { Anchor, Axis, FingerRole, GestureEvent, Track } from './types';

type Snapshot = SnapshotFrom<typeof gestureMachine>;

/** One pointer event, from any input source: `t` in ms on one clock. */
export type PointerInput = {
  readonly id: number;
  readonly type: 'down' | 'move' | 'up' | 'cancel';
  readonly x: number;
  readonly y: number;
  readonly t: number;
};

/** A pointer that is down, and what it is doing. */
export type Finger = Track & { readonly role: FingerRole };

/** The last tap or double tap, for layers to answer; `count` tells a new one from the last. */
export type TapMark = {
  readonly kind: 'tap' | 'double-tap';
  readonly x: number;
  readonly y: number;
  readonly count: number;
};

/** Everything the finger layer and debug overlay show. */
export type Inspection = {
  readonly fingers: ReadonlyArray<Finger>;
  readonly anchor: Anchor | undefined;
  readonly tap: TapMark | undefined;
  /** Where the machine is, for the state diagram. */
  readonly value: Snapshot['value'];
};

/** The clock delayed transitions run on: the page's timers, or a simulated one in tests. */
export type Clock = NonNullable<ActorOptions<typeof gestureMachine>['clock']>;

const roleOf = (snapshot: Snapshot, id: number): FingerRole => {
  const { anchor, finger } = snapshot.context;
  if (anchor?.id === id) return 'anchor';
  if (finger !== id) return 'free';
  if (
    snapshot.matches('pressing') ||
    snapshot.matches({ anchored: 'pressing' })
  ) {
    return 'pending';
  }
  if (
    snapshot.matches('swiping') ||
    snapshot.matches({ anchored: 'panning' })
  ) {
    return 'acting';
  }
  return 'free';
};

/**
 * Reads gestures from raw pointer input, touching no DOM: pointers in,
 * {@link GestureEvent}s out, through one state machine (see
 * `gestureMachine`). A touch runs from the first pointer down until every
 * pointer is up. Holds and double-tap waits run on `clock`.
 */
export const createGestureEngine = (options: {
  readonly axis?: Axis;
  readonly onGesture: (event: GestureEvent) => void;
  readonly clock?: Clock;
}) => {
  const pointers = createPointerTracker();
  const listeners = new Set<() => void>();
  let tap: TapMark | undefined;

  const actor = createActor(gestureMachine, {
    input: {
      pointers,
      axis: options.axis ?? 'x',
    },
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });
  const notify = () => {
    for (const listener of listeners) listener();
  };
  actor.on('gesture', ({ event }) => {
    if (event.kind === 'tap' || event.kind === 'double-tap') {
      tap = {
        kind: event.kind,
        x: event.x,
        y: event.y,
        count: (tap?.count ?? 0) + 1,
      };
    }
    options.onGesture(event);
  });
  // Timers move the machine with no input, so every snapshot notifies.
  actor.subscribe(notify);
  actor.start();

  const feed = (input: PointerInput) => {
    let track: Track | undefined;
    if (input.type === 'down') {
      if (pointers.has(input.id)) return;
      track = pointers.down(input);
    } else if (input.type === 'move') {
      track = pointers.move(input);
    } else {
      track = pointers.up(input);
    }
    if (track === undefined) return;
    actor.send({ type: input.type, track });
    notify();
  };

  return {
    feed,
    /** Cancels whatever is under way, as if the platform had taken every pointer. */
    cancelAll: () => {
      const down = pointers.list();
      if (down.length === 0) return;
      // One at a time, so the first cancel still sees the others.
      for (const { id, current } of down) {
        const track = pointers.up({ id, ...current });
        if (track !== undefined) actor.send({ type: 'cancel', track });
      }
      notify();
    },
    /**
     * Whether the current touch is Captured: a pan started or an Anchor
     * locked, and a finger is still down, so the page must not scroll.
     */
    captured: (): boolean =>
      actor.getSnapshot().context.captured && pointers.size() > 0,
    inspect: (): Inspection => {
      const snapshot = actor.getSnapshot();
      const { anchor } = snapshot.context;
      return {
        fingers: pointers.list().map((track) => ({
          ...track,
          role: roleOf(snapshot, track.id),
        })),
        anchor:
          anchor === undefined
            ? undefined
            : { side: anchor.side, x: anchor.x, y: anchor.y },
        tap,
        value: snapshot.value,
      };
    },
    /** Called after every input and every timer the machine runs. */
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop: () => actor.stop(),
  };
};

export type GestureEngine = ReturnType<typeof createGestureEngine>;
