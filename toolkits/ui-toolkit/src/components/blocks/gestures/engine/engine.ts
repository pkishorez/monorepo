import { type ActorOptions, createActor, type SnapshotFrom } from 'xstate';
import { gestureMachine } from './machine';
import { createPointerTracker } from './pointers';
import type {
  FingerRole,
  GestureEvent,
  Hold,
  Policy,
  Scroll,
  TouchStart,
  Track,
} from './types';

export { along, opposite } from './group';
export { gestureMachine };
export { HOLD_STILL_SHARE, SLOP_PX, TAP_MAX_MS } from './thresholds';
export type {
  Combination,
  Direction,
  Fingers,
  GestureEvent,
  Hold,
  MovementEvent,
  Point,
  Policy,
  Scroll,
  Side,
  TapEvent,
  TouchStart,
} from './types';

type Snapshot = SnapshotFrom<typeof gestureMachine>;

/** One pointer event, from any input source: `t` in ms on one clock. */
export type PointerInput = {
  readonly id: number;
  readonly type: 'down' | 'move' | 'up' | 'cancel';
  readonly x: number;
  readonly y: number;
  readonly t: number;
  /** On a down: what the zone knows about the touch it may start. */
  readonly start?: TouchStart;
};

/** A pointer that is down, and what it is doing. */
export type Finger = Track & { readonly role: FingerRole };

/** Everything the finger layer and debug overlay show. */
export type Inspection = {
  readonly fingers: ReadonlyArray<Finger>;
  readonly hold: Hold | undefined;
  /** Where the machine is, for the state diagram. */
  readonly value: Snapshot['value'];
};

/** The clock delayed transitions run on: the page's timers, or a simulated one in tests. */
export type Clock = NonNullable<ActorOptions<typeof gestureMachine>['clock']>;

const PRESSING = ['pressing', { held: 'pressing' }] as const;

const roleOf = (snapshot: Snapshot, id: number): FingerRole => {
  const { hold, claim } = snapshot.context;
  if (hold?.id === id) return 'hold';
  if (claim?.ids.includes(id)) return 'acting';
  return PRESSING.some((state) => snapshot.matches(state)) ? 'pending' : 'free';
};

/**
 * Reads gestures from raw pointer input, touching no DOM: pointers in,
 * {@link GestureEvent}s out, through one state machine (see
 * `gestureMachine`). `policy` answers what the registered gestures allow at
 * each decision; `scroll` is the axis the browser keeps for one finger. A
 * touch runs from the first pointer down until every pointer is up, and is
 * announced as it starts and ends. Tap timeouts run on `clock`.
 */
export const createGestureEngine = (options: {
  readonly scroll?: Scroll;
  readonly policy: Policy;
  readonly onGesture: (event: GestureEvent) => void;
  readonly clock?: Clock;
  readonly onError?: (error: unknown) => void;
}) => {
  const pointers = createPointerTracker();
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };
  let stopped = false;
  const makeActor = () => {
    const next = createActor(gestureMachine, {
      input: {
        pointers,
        policy: options.policy,
        scroll: options.scroll ?? 'y',
      },
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    });
    next.on('gesture', ({ event }) => options.onGesture(event));
    next.subscribe({
      next: notify,
      error: (error) => {
        if (options.onError !== undefined) options.onError(error);
        else console.error('Gesture engine failed', error);
        notify();
      },
    });
    return next;
  };
  let actor = makeActor();
  actor.start();

  const recover = () => {
    if (
      stopped ||
      pointers.size() !== 0 ||
      actor.getSnapshot().status !== 'error'
    )
      return;
    actor.stop();
    actor = makeActor();
    actor.start();
  };

  const send = (
    type: PointerInput['type'],
    track: Track,
    start?: TouchStart,
  ) => {
    if (actor.getSnapshot().status === 'active') {
      actor.send({ type, track, ...(start === undefined ? {} : { start }) });
    }
    if (type !== 'down' && type !== 'move' && pointers.size() === 0) {
      try {
        options.onGesture({ kind: 'touch', phase: 'end' });
      } finally {
        recover();
      }
    }
  };

  const feed = (input: PointerInput) => {
    if (stopped) return;
    recover();
    if (input.type === 'down') {
      if (pointers.has(input.id)) return;
      if (pointers.size() === 0) {
        options.onGesture({ kind: 'touch', phase: 'start' });
      }
      send('down', pointers.down(input), input.start);
    } else {
      const track =
        input.type === 'move' ? pointers.move(input) : pointers.up(input);
      if (track === undefined) return;
      send(input.type, track);
    }
    notify();
  };

  return {
    feed,
    /** Cancels whatever is under way, as if the platform had taken every pointer. */
    cancelAll: () => {
      const down = pointers.list();
      if (stopped) return;
      if (down.length === 0) {
        recover();
        return;
      }
      // One at a time, so the first cancel still sees the others.
      for (const { id, current } of down) {
        const track = pointers.up({ id, ...current });
        if (track !== undefined) send('cancel', track);
      }
      notify();
    },
    /**
     * Whether the current touch is Captured, so the page must not scroll: 2+
     * fingers went down, a gesture was claimed or a Hold locked, or one finger
     * is heading for a claim at a scroller's end; and a finger is still down.
     */
    captured: (): boolean => {
      const { captured, leaning } = actor.getSnapshot().context;
      return (captured || leaning) && pointers.size() > 0;
    },
    inspect: (): Inspection => {
      const snapshot = actor.getSnapshot();
      const hold =
        snapshot.status === 'error' ? undefined : snapshot.context.hold;
      return {
        fingers: pointers.list().map((track) => ({
          ...track,
          role:
            snapshot.status === 'error' ? 'free' : roleOf(snapshot, track.id),
        })),
        hold:
          hold === undefined
            ? undefined
            : { side: hold.side, point: hold.point },
        value: snapshot.value,
      };
    },
    /** Called after every input and every timer the machine runs. */
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop: () => {
      stopped = true;
      actor.stop();
      listeners.clear();
    },
  };
};

export type GestureEngine = ReturnType<typeof createGestureEngine>;
