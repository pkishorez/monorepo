import { and, assign, enqueueActions, not, setup } from 'xstate';
import type { PointerTracker } from './pointers';
import {
  ANCHOR_DRIFT_PX,
  DOUBLE_TAP_DISTANCE_PX,
  DOUBLE_TAP_GAP_MS,
  SLOP_PX,
  TAP_MAX_MS,
} from './thresholds';
import type {
  Anchor,
  AnchorPhase,
  Axis,
  GestureEvent,
  PanPhase,
  Side,
  Track,
} from './types';

export type MachineInput = {
  /** Kept up to date by the engine before every event it sends. */
  readonly pointers: PointerTracker;
  readonly axis: Axis;
};

/** One pointer input; `track` is the pointer after it, even one that just lifted. */
export type MachineEvent = {
  readonly type: 'down' | 'move' | 'up' | 'cancel';
  readonly track: Track;
};

type Context = MachineInput & {
  /** The finger a tap, double tap or pan is read from, while it is down. */
  finger: number | undefined;
  anchor: (Anchor & { readonly id: number }) | undefined;
  /** A tap waiting to see if a second one makes it a double tap. */
  pendingTap:
    | { readonly x: number; readonly y: number; anchor: Anchor | undefined }
    | undefined;
  /** The press has been down too long to be a tap. */
  tapExpired: boolean;
  panning: boolean;
  /** The app owns this touch: set by a pan or a lock, until every finger lifts. */
  captured: boolean;
};

const publicAnchor = (context: Context): Anchor | undefined =>
  context.anchor === undefined
    ? undefined
    : { side: context.anchor.side, x: context.anchor.x, y: context.anchor.y };

/** The finger's track, from the event when it is the one that just lifted. */
const fingerTrack = (
  context: Context,
  event: MachineEvent,
): Track | undefined =>
  event.track.id === context.finger
    ? event.track
    : context.finger === undefined
      ? undefined
      : context.pointers.get(context.finger);

const panEvent = (
  context: Context,
  event: MachineEvent,
  phase: PanPhase,
): GestureEvent | undefined => {
  const track = fingerTrack(context, event);
  if (track === undefined) return undefined;
  const free = context.anchor !== undefined;
  const keepX = free || context.axis === 'x';
  const keepY = free || context.axis === 'y';
  // Read at this event's time: a finger held still reads as a stop.
  const velocity = context.pointers.velocity(track.id, event.track.current.t);
  return {
    kind: 'pan',
    phase,
    x: track.current.x,
    y: track.current.y,
    dx: keepX ? track.current.x - track.down.x : 0,
    dy: keepY ? track.current.y - track.down.y : 0,
    velocityX: keepX ? velocity.x : 0,
    velocityY: keepY ? velocity.y : 0,
    anchor: publicAnchor(context),
  };
};

const anchorEvent = (
  phase: AnchorPhase,
  at: { readonly x: number; readonly y: number },
  side: Side,
): GestureEvent => ({ kind: 'anchor', phase, x: at.x, y: at.y, side });

const gesture = (event: GestureEvent) => ({ type: 'gesture' as const, event });

/**
 * The whole gesture model as one machine. One finger goes down
 * (`pressing`) and becomes a tap, the first half of a double tap
 * (`tapped`), a swipe along the zone's axis, or a drag along the other axis
 * left to the browser (`native`). A second finger landing while the first is
 * still makes the first the Anchor, locked at once (`anchored`): like a held
 * Shift key it modifies every tap, double tap or pan of the other finger,
 * which now pans freely, until the Anchor itself lifts. A third finger, or
 * the browser taking a pointer, leave the rest of the touch to `ignoring`.
 */
export const gestureMachine = setup({
  types: {
    context: {} as Context,
    events: {} as MachineEvent,
    input: {} as MachineInput,
    emitted: {} as ReturnType<typeof gesture>,
  },
  guards: {
    isFinger: ({ context, event }) => event.track.id === context.finger,
    isAnchor: ({ context, event }) => event.track.id === context.anchor?.id,
    pastSlop: ({ event }) => event.track.travel > SLOP_PX,
    alongAxis: ({ context, event }) => {
      const { current, down } = event.track;
      const dx = Math.abs(current.x - down.x);
      const dy = Math.abs(current.y - down.y);
      return context.axis === 'x' ? dx > dy : dy > dx;
    },
    drifted: ({ event }) => event.track.travel > ANCHOR_DRIFT_PX,
    quick: ({ context }) => !context.tapExpired,
    secondTap: ({ context }) => context.pendingTap !== undefined,
    near: ({ context, event }) =>
      context.pendingTap !== undefined &&
      Math.hypot(
        event.track.down.x - context.pendingTap.x,
        event.track.down.y - context.pendingTap.y,
      ) <= DOUBLE_TAP_DISTANCE_PX,
    noPointers: ({ context }) => context.pointers.size() === 0,
  },
  actions: {
    press: assign({
      finger: ({ event }) => event.track.id,
      tapExpired: false,
    }),
    expireTap: assign({ tapExpired: true }),
    pan: enqueueActions(
      ({ context, event, enqueue }, params: { readonly phase: PanPhase }) => {
        const pan = panEvent(context, event, params.phase);
        if (pan !== undefined) enqueue.emit(gesture(pan));
        enqueue.assign({ panning: true, captured: true });
      },
    ),
    endPan: enqueueActions(
      ({ context, event, enqueue }, params: { readonly phase: PanPhase }) => {
        if (!context.panning) return;
        const pan = panEvent(context, event, params.phase);
        if (pan !== undefined) enqueue.emit(gesture(pan));
        enqueue.assign({ panning: false });
      },
    ),
    holdTap: assign({
      pendingTap: ({ context, event }) => ({
        x: event.track.current.x,
        y: event.track.current.y,
        anchor: publicAnchor(context),
      }),
    }),
    flushTap: enqueueActions(({ context, enqueue }) => {
      const tap = context.pendingTap;
      if (tap === undefined) return;
      enqueue.emit(gesture({ kind: 'tap', ...tap }));
      enqueue.assign({ pendingTap: undefined });
    }),
    doubleTap: enqueueActions(({ context, event, enqueue }) => {
      enqueue.emit(
        gesture({
          kind: 'double-tap',
          x: event.track.current.x,
          y: event.track.current.y,
          anchor: publicAnchor(context),
        }),
      );
      enqueue.assign({ pendingTap: undefined });
    }),
    // The finger down becomes the Anchor, on the side of the one landing.
    lock: enqueueActions(({ context, event, enqueue }) => {
      const held =
        context.finger === undefined
          ? undefined
          : context.pointers.get(context.finger);
      if (held === undefined) return;
      const side: Side =
        held.current.x < event.track.current.x ? 'left' : 'right';
      enqueue.assign({
        anchor: { id: held.id, side, x: held.current.x, y: held.current.y },
        captured: true,
      });
      enqueue.emit(gesture(anchorEvent('locked', held.current, side)));
    }),
    followAnchor: assign({
      anchor: ({ context, event }) =>
        context.anchor === undefined
          ? undefined
          : {
              ...context.anchor,
              x: event.track.current.x,
              y: event.track.current.y,
            },
    }),
    endAnchor: enqueueActions(
      ({ context, enqueue }, params: { readonly phase: AnchorPhase }) => {
        const anchor = context.anchor;
        if (anchor === undefined) return;
        enqueue.emit(gesture(anchorEvent(params.phase, anchor, anchor.side)));
        enqueue.assign({ anchor: undefined });
      },
    ),
    settleIfEmpty: assign({
      finger: undefined,
      captured: ({ context }) =>
        context.captured && context.pointers.size() > 0,
    }),
  },
}).createMachine({
  id: 'gestures',
  context: ({ input }) => ({
    ...input,
    finger: undefined,
    anchor: undefined,
    pendingTap: undefined,
    tapExpired: false,
    panning: false,
    captured: false,
  }),
  initial: 'idle',
  // The browser took a pointer, usually for a scroll.
  on: {
    cancel: {
      target: '.ignoring',
      actions: [
        { type: 'endPan', params: { phase: 'cancelled' } },
        'flushTap',
        { type: 'endAnchor', params: { phase: 'cancelled' } },
      ],
    },
  },
  states: {
    idle: {
      entry: 'settleIfEmpty',
      on: { down: { target: 'pressing', actions: 'press' } },
    },
    /** One finger down, undecided. */
    pressing: {
      after: { [TAP_MAX_MS]: { actions: ['flushTap', 'expireTap'] } },
      on: {
        // A second finger while this one is still: this one locks.
        down: {
          target: 'anchored.pressing',
          actions: ['flushTap', 'lock', 'press'],
        },
        move: [
          {
            guard: and(['isFinger', 'pastSlop', 'alongAxis']),
            target: 'swiping',
            actions: ['flushTap', { type: 'pan', params: { phase: 'began' } }],
          },
          {
            guard: and(['isFinger', 'pastSlop']),
            target: 'native',
            actions: 'flushTap',
          },
        ],
        up: [
          {
            guard: and(['isFinger', 'quick', 'secondTap']),
            target: 'idle',
            actions: 'doubleTap',
          },
          {
            guard: and(['isFinger', 'quick']),
            target: 'tapped',
            actions: 'holdTap',
          },
          { guard: 'isFinger', target: 'idle', actions: 'flushTap' },
        ],
      },
    },
    /** A one-finger pan along the zone's axis, Captured. A second finger is left out of it. */
    swiping: {
      on: {
        move: {
          guard: 'isFinger',
          actions: { type: 'pan', params: { phase: 'changed' } },
        },
        up: [
          {
            guard: and(['isFinger', not('noPointers')]),
            target: 'ignoring',
            actions: { type: 'endPan', params: { phase: 'ended' } },
          },
          {
            guard: 'isFinger',
            target: 'idle',
            actions: { type: 'endPan', params: { phase: 'ended' } },
          },
        ],
      },
    },
    /** A tap, waiting to see if a second makes it a double tap. */
    tapped: {
      after: { [DOUBLE_TAP_GAP_MS]: { target: 'idle', actions: 'flushTap' } },
      on: {
        down: [
          { guard: 'near', target: 'pressing', actions: 'press' },
          { target: 'pressing', actions: ['flushTap', 'press'] },
        ],
      },
    },
    /**
     * The Anchor is locked and the touch Captured. Inside, the other finger
     * taps, double taps and pans, in 2D, as often as it likes.
     */
    anchored: {
      initial: 'idle',
      on: {
        move: [
          // Drift cancels: the Anchor was not held still after all.
          {
            guard: and(['isAnchor', 'drifted']),
            target: 'ignoring',
            actions: [
              { type: 'endPan', params: { phase: 'cancelled' } },
              'flushTap',
              { type: 'endAnchor', params: { phase: 'cancelled' } },
            ],
          },
          { guard: 'isAnchor', actions: 'followAnchor' },
        ],
        // Lifting the Anchor releases it, ending a pan under way so a flick
        // still coasts.
        up: {
          guard: 'isAnchor',
          target: 'ignoring',
          actions: [
            { type: 'endPan', params: { phase: 'ended' } },
            'flushTap',
            { type: 'endAnchor', params: { phase: 'released' } },
          ],
        },
        // A third finger.
        down: {
          target: 'ignoring',
          actions: [
            { type: 'endPan', params: { phase: 'cancelled' } },
            'flushTap',
            { type: 'endAnchor', params: { phase: 'cancelled' } },
          ],
        },
      },
      states: {
        idle: {
          on: { down: { target: 'pressing', actions: 'press' } },
        },
        pressing: {
          after: { [TAP_MAX_MS]: { actions: ['flushTap', 'expireTap'] } },
          on: {
            move: {
              guard: and(['isFinger', 'pastSlop']),
              target: 'panning',
              actions: [
                'flushTap',
                { type: 'pan', params: { phase: 'began' } },
              ],
            },
            up: [
              {
                guard: and(['isFinger', 'quick', 'secondTap']),
                target: 'idle',
                actions: 'doubleTap',
              },
              {
                guard: and(['isFinger', 'quick']),
                target: 'tapped',
                actions: 'holdTap',
              },
              { guard: 'isFinger', target: 'idle', actions: 'flushTap' },
            ],
          },
        },
        panning: {
          on: {
            move: {
              guard: 'isFinger',
              actions: { type: 'pan', params: { phase: 'changed' } },
            },
            up: {
              guard: 'isFinger',
              target: 'idle',
              actions: { type: 'endPan', params: { phase: 'ended' } },
            },
          },
        },
        tapped: {
          after: {
            [DOUBLE_TAP_GAP_MS]: { target: 'idle', actions: 'flushTap' },
          },
          on: {
            down: [
              { guard: 'near', target: 'pressing', actions: 'press' },
              { target: 'pressing', actions: ['flushTap', 'press'] },
            ],
          },
        },
      },
    },
    /** The browser is scrolling this touch. */
    native: {
      always: { guard: 'noPointers', target: 'idle' },
    },
    /** Not a gesture; wait for every finger to lift. */
    ignoring: {
      always: { guard: 'noPointers', target: 'idle' },
    },
  },
});
