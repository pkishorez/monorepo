import { and, assign, enqueueActions, not, setup } from 'xstate';
import {
  actingTracks,
  type Claim,
  decideActing,
  decideActingLift,
  decideLift,
  decideMovement,
  FRESH_PRESS,
  leans,
  type Locked,
  lockAfterWait,
  type Press,
  type Situation,
} from './decide';
import { doubled, holdEvent, holdOf, movementEvent } from './events';
import { pointOf } from './group';
import type { PointerTracker } from './pointers';
import {
  DOUBLE_TAP_DISTANCE_PX,
  DOUBLE_TAP_GAP_MS,
  HOLD_DRIFT_PX,
  TAP_MAX_MS,
} from './thresholds';
import type {
  GestureEvent,
  Phase,
  Policy,
  Scroll,
  TapEvent,
  TouchStart,
  Track,
} from './types';

export type MachineInput = {
  /** Kept up to date by the engine before every event it sends. */
  readonly pointers: PointerTracker;
  readonly policy: Policy;
  readonly scroll: Scroll;
};

/** One pointer input; `track` is the pointer after it, even one that just lifted. */
export type MachineEvent = {
  readonly type: 'down' | 'move' | 'up' | 'cancel';
  readonly track: Track;
  /** On the first finger down: what the zone knows about the touch. */
  readonly start?: TouchStart;
};

type Context = MachineInput & {
  start: TouchStart | undefined;
  hold: Locked | undefined;
  /** The Pan, Swipe or Pinch under way. */
  claim: Claim | undefined;
  press: Press;
  /** A tap waiting to see if a second makes it a double tap. */
  pendingTap: TapEvent | undefined;
  /** The app owns this touch until every finger lifts: 2+ fingers, a claim or a Hold. */
  captured: boolean;
  /** One finger inside the slop heading for a claim at a scroller's end. */
  leaning: boolean;
  /** How long `pressing.waiting` waits for the stayer, in ms. */
  waitMs: number;
};

const gesture = (event: GestureEvent) => ({ type: 'gesture' as const, event });

const situation = (context: Context): Situation => context;

const sameCombination = (a: TapEvent, b: TapEvent) =>
  a.fingers === b.fingers && a.hold?.side === b.hold?.side;

const near = (a: TapEvent, b: TapEvent) =>
  Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y) <=
  DOUBLE_TAP_DISTANCE_PX;

/**
 * What a new tap does to the one waiting, if any: completes a double tap,
 * lets the first go and takes its place, or goes out at once when no double
 * tap is registered for its combination.
 */
const resolveTap = (
  context: Context,
  tap: TapEvent | undefined,
): {
  readonly emit: ReadonlyArray<TapEvent>;
  readonly pendingTap: TapEvent | undefined;
} => {
  const first = context.pendingTap;
  if (tap === undefined) return { emit: [], pendingTap: first };
  if (first !== undefined && sameCombination(first, tap) && near(first, tap)) {
    return { emit: [doubled(tap)], pendingTap: undefined };
  }
  const waits = context.policy.doubleTap({
    fingers: tap.fingers,
    hold: tap.hold?.side,
  });
  const flushed = first === undefined ? [] : [first];
  return waits
    ? { emit: flushed, pendingTap: tap }
    : { emit: [...flushed, tap], pendingTap: undefined };
};

type Enqueue = {
  readonly emit: (event: ReturnType<typeof gesture>) => void;
  readonly assign: (update: Partial<Context>) => void;
};

const flushAway = (context: Context, enqueue: Enqueue) => {
  if (context.pendingTap === undefined) return;
  enqueue.emit(gesture(context.pendingTap));
  enqueue.assign({ pendingTap: undefined });
};

const tapAway = (
  context: Context,
  enqueue: Enqueue,
  tap: TapEvent | undefined,
) => {
  // Buttons and links own a stationary press as their native click. They are
  // still tracked so moving past the slop may become a Pan or Swipe.
  if (context.start?.nativeTap === true) {
    flushAway(context, enqueue);
    return;
  }
  const resolved = resolveTap(context, tap);
  for (const event of resolved.emit) enqueue.emit(gesture(event));
  enqueue.assign({ pendingTap: resolved.pendingTap });
};

/**
 * The whole gesture model as one machine. Nothing is decided when fingers
 * land (`pressing`); the first movement past the slop decides: one finger
 * pans or swipes (`moving`), or along the scroll axis is left to the browser
 * (`native`); with more fingers the one down longest, if still, locks as the
 * Hold (`held`), and like a held Shift key it modifies every tap and
 * movement of the other fingers until it lifts; two fingers moving together
 * Pinch or pan. Fingers that land and lift quickly tap, a double tap waiting
 * in `tapped` only when one is registered. A gesture stays what it was
 * classified as until its fingers lift. Anything else, or the browser taking
 * a pointer, leaves the rest of the touch to `ignoring`.
 */
export const gestureMachine = setup({
  types: {
    context: {} as Context,
    events: {} as MachineEvent,
    input: {} as MachineInput,
    emitted: {} as ReturnType<typeof gesture>,
  },
  delays: {
    // The rest of the tap time from the first landing, for a young stayer.
    tapTimeLeft: ({ context }) => context.waitMs,
  },
  guards: {
    decides: ({ context, event }, params: { readonly next: string }) =>
      decideMovement(situation(context), event.track)?.next === params.next,
    decidesActing: ({ context, event }, params: { readonly next: string }) =>
      decideActing(situation(context), event.track)?.next === params.next,
    lifts: ({ context, event }, params: { readonly next: string }) =>
      decideLift(situation(context), context.press, event.track).next ===
      params.next,
    liftsActing: ({ context, event }, params: { readonly next: string }) =>
      decideActingLift(situation(context), context.press, event.track)?.next ===
      params.next,
    isHold: ({ context, event }) => event.track.id === context.hold?.id,
    drifted: ({ event }) => event.track.travel > HOLD_DRIFT_PX,
    inClaim: ({ context, event }) =>
      context.claim?.ids.includes(event.track.id) ?? false,
    tapPending: ({ context }) => context.pendingTap !== undefined,
    // A third acting finger under a Hold, or a fourth finger.
    tooMany: ({ context }) =>
      context.hold === undefined
        ? context.pointers.size() > 3
        : actingTracks(situation(context)).length > 2,
    noPointers: ({ context }) => context.pointers.size() === 0,
    oneFinger: ({ context }) => context.pointers.size() === 1,
    noActing: ({ context }) => actingTracks(situation(context)).length === 0,
  },
  actions: {
    begin: assign({
      start: ({ event }) => event.start,
      press: FRESH_PRESS,
      captured: false,
      leaning: false,
    }),
    capture: assign({
      captured: ({ context }) =>
        context.captured || context.pointers.size() >= 2,
    }),
    lean: assign({
      leaning: ({ context, event }) => leans(situation(context), event.track),
    }),
    resetPress: assign({ press: FRESH_PRESS }),
    // A finger landing while a tap waits on a stayer makes it no tap at all.
    spoilTapped: assign({
      press: ({ context }) =>
        context.press.tappers.length > 0
          ? { tappers: [], spoiled: true }
          : context.press,
    }),
    // A first tap waiting for a second is let go as a single tap.
    flushTap: enqueueActions(({ context, enqueue }) => {
      if (context.pendingTap === undefined) return;
      enqueue.emit(gesture(context.pendingTap));
      enqueue.assign({ pendingTap: undefined });
    }),
    /** Applies the first movement's decision: locks the Hold, claims the gesture. */
    decide: enqueueActions(({ context, event, enqueue }) => {
      const decision = decideMovement(situation(context), event.track);
      if (decision === undefined) return;
      enqueue.assign({ leaning: false });
      const hold = 'hold' in decision ? decision.hold : undefined;
      if (hold !== undefined) {
        enqueue.assign({ hold, captured: true });
        enqueue.emit(gesture(holdEvent('lock', hold)));
      }
      if (!('claim' in decision)) return;
      const start = movementEvent(
        decision.claim,
        'start',
        { pointers: context.pointers, hold, start: context.start },
        event.track,
      );
      enqueue.assign({ claim: decision.claim, captured: true });
      if (start !== undefined) enqueue.emit(gesture(start));
    }),
    decideActing: enqueueActions(({ context, event, enqueue }) => {
      const decision = decideActing(situation(context), event.track);
      if (decision?.next !== 'moving') return;
      const start = movementEvent(
        decision.claim,
        'start',
        context,
        event.track,
      );
      enqueue.assign({ claim: decision.claim });
      if (start !== undefined) enqueue.emit(gesture(start));
    }),
    follow: enqueueActions(
      ({ context, event, enqueue }, params: { readonly phase: Phase }) => {
        const claim = context.claim;
        if (claim === undefined) return;
        const phase = movementEvent(claim, params.phase, context, event.track);
        if (phase !== undefined) enqueue.emit(gesture(phase));
        if (params.phase !== 'move') enqueue.assign({ claim: undefined });
      },
    ),
    /** Applies a lift of a press with no Hold: taps, and a Hold locked by a tap. */
    lift: enqueueActions(({ context, event, enqueue }) => {
      const lift = decideLift(situation(context), context.press, event.track);
      switch (lift.next) {
        case 'tap':
          tapAway(context, enqueue, lift.tap);
          return;
        case 'hold-tap':
          enqueue.assign({
            hold: lift.hold,
            captured: true,
            press: FRESH_PRESS,
          });
          enqueue.emit(gesture(holdEvent('lock', lift.hold)));
          tapAway(context, enqueue, lift.tap);
          return;
        case 'wait':
          enqueue.assign({ press: lift.press, waitMs: lift.waitMs });
          return;
        case 'continue':
          enqueue.assign({ press: lift.press });
          return;
        case 'done':
          flushAway(context, enqueue);
      }
    }),
    lockAfterWait: enqueueActions(({ context, enqueue }) => {
      const locked = lockAfterWait(situation(context), context.press);
      if (locked === undefined) return;
      enqueue.assign({ hold: locked.hold, captured: true, press: FRESH_PRESS });
      enqueue.emit(gesture(holdEvent('lock', locked.hold)));
      tapAway(context, enqueue, locked.tap);
    }),
    liftActing: enqueueActions(({ context, event, enqueue }) => {
      const lift = decideActingLift(
        situation(context),
        context.press,
        event.track,
      );
      if (lift === undefined) return;
      if (lift.next === 'tap') {
        tapAway(context, enqueue, lift.tap);
      } else if (lift.next === 'continue') {
        enqueue.assign({ press: lift.press });
      } else {
        flushAway(context, enqueue);
      }
    }),
    // The tap time ran out under a Hold with an acting finger still down:
    // one that already lifted tapped on its own.
    expireActingPress: enqueueActions(({ context, enqueue }) => {
      const [tapper, ...more] = context.press.tappers;
      flushAway(context, enqueue);
      if (tapper !== undefined && more.length === 0) {
        enqueue.emit(
          gesture({
            kind: 'tap',
            count: 1,
            fingers: 1,
            hold: holdOf(context.hold),
            point: tapper.point,
          }),
        );
      }
      enqueue.assign({ press: FRESH_PRESS });
    }),
    followHold: assign({
      hold: ({ context, event }) =>
        context.hold === undefined
          ? undefined
          : { ...context.hold, point: pointOf(event.track.current) },
    }),
    endHold: enqueueActions(
      (
        { context, enqueue },
        params: { readonly phase: 'release' | 'cancel' },
      ) => {
        const hold = context.hold;
        if (hold === undefined) return;
        enqueue.emit(gesture(holdEvent(params.phase, hold)));
        enqueue.assign({ hold: undefined });
      },
    ),
    settle: assign({
      claim: undefined,
      hold: undefined,
      press: FRESH_PRESS,
      leaning: false,
      captured: ({ context }) =>
        context.captured && context.pointers.size() > 0,
    }),
  },
}).createMachine({
  id: 'gestures',
  context: ({ input }) => ({
    ...input,
    start: undefined,
    hold: undefined,
    claim: undefined,
    press: FRESH_PRESS,
    pendingTap: undefined,
    captured: false,
    leaning: false,
    waitMs: 0,
  }),
  initial: 'idle',
  // The browser took a pointer, usually for a scroll.
  on: {
    cancel: {
      target: '.ignoring',
      actions: [
        { type: 'follow', params: { phase: 'cancel' } },
        'flushTap',
        { type: 'endHold', params: { phase: 'cancel' } },
      ],
    },
  },
  states: {
    idle: {
      entry: 'settle',
      always: { guard: 'tapPending', target: 'tapped' },
      on: { down: { target: 'pressing', actions: 'begin' } },
    },
    /** Fingers down, nothing moved yet. */
    pressing: {
      initial: 'down',
      // Too long for this press to be the second tap of a double tap.
      after: { [TAP_MAX_MS]: { actions: 'flushTap' } },
      on: {
        down: [
          {
            guard: 'tooMany',
            target: 'ignoring',
            actions: ['capture', 'flushTap'],
          },
          { target: '.down', actions: ['capture', 'spoilTapped'] },
        ],
        move: [
          {
            guard: { type: 'decides', params: { next: 'native' } },
            target: 'native',
            actions: 'flushTap',
          },
          {
            guard: { type: 'decides', params: { next: 'moving' } },
            target: 'moving',
            actions: ['flushTap', 'decide'],
          },
          {
            guard: { type: 'decides', params: { next: 'held.moving' } },
            target: 'held.moving',
            actions: ['flushTap', 'decide'],
          },
          {
            guard: { type: 'decides', params: { next: 'held.ignoring' } },
            target: 'held.ignoring',
            actions: ['flushTap', 'decide'],
          },
          {
            guard: { type: 'decides', params: { next: 'ignoring' } },
            target: 'ignoring',
            actions: 'flushTap',
          },
          { actions: 'lean' },
        ],
        up: [
          {
            guard: { type: 'lifts', params: { next: 'hold-tap' } },
            target: 'held',
            actions: 'lift',
          },
          {
            guard: { type: 'lifts', params: { next: 'wait' } },
            target: '.waiting',
            actions: 'lift',
          },
          {
            guard: { type: 'lifts', params: { next: 'continue' } },
            target: '.down',
            actions: 'lift',
          },
          { target: 'idle', actions: 'lift' },
        ],
      },
      states: {
        down: {},
        /**
         * A finger tapped while another stays: it is a two-finger tap if
         * that one lifts in the tap time, or the Hold when the time runs out.
         */
        waiting: {
          after: {
            tapTimeLeft: {
              guard: 'oneFinger',
              target: '#gestures.held',
              actions: 'lockAfterWait',
            },
          },
        },
      },
    },
    /** A Pan, Swipe or Pinch with no Hold, Captured. Another finger is left out of it. */
    moving: {
      on: {
        down: { actions: 'capture' },
        move: {
          guard: 'inClaim',
          actions: { type: 'follow', params: { phase: 'move' } },
        },
        up: [
          {
            guard: and(['inClaim', not('noPointers')]),
            target: 'ignoring',
            actions: { type: 'follow', params: { phase: 'end' } },
          },
          {
            guard: 'inClaim',
            target: 'idle',
            actions: { type: 'follow', params: { phase: 'end' } },
          },
        ],
      },
    },
    /** A tap, waiting to see if a second makes it a double tap. */
    tapped: {
      after: { [DOUBLE_TAP_GAP_MS]: { target: 'idle', actions: 'flushTap' } },
      on: { down: { target: 'pressing', actions: 'begin' } },
    },
    /**
     * The Hold is locked and the touch Captured. Inside, the other fingers
     * tap, double tap, pan, swipe and pinch, as often as they like.
     */
    held: {
      initial: 'idle',
      on: {
        move: [
          // Drift cancels: the finger was not held still after all.
          {
            guard: and(['isHold', 'drifted']),
            target: 'ignoring',
            actions: [
              { type: 'follow', params: { phase: 'cancel' } },
              'flushTap',
              { type: 'endHold', params: { phase: 'cancel' } },
            ],
          },
          { guard: 'isHold', actions: 'followHold' },
        ],
        // Lifting the Hold releases it, ending a gesture under way so a
        // flick still coasts.
        up: {
          guard: 'isHold',
          target: 'ignoring',
          actions: [
            { type: 'follow', params: { phase: 'end' } },
            'flushTap',
            { type: 'endHold', params: { phase: 'release' } },
          ],
        },
        down: [
          {
            guard: 'tooMany',
            target: 'ignoring',
            actions: [
              { type: 'follow', params: { phase: 'cancel' } },
              'flushTap',
              { type: 'endHold', params: { phase: 'cancel' } },
            ],
          },
        ],
      },
      states: {
        idle: {
          always: { guard: 'tapPending', target: 'tapped' },
          on: { down: { target: 'pressing', actions: 'resetPress' } },
        },
        pressing: {
          after: { [TAP_MAX_MS]: { actions: 'expireActingPress' } },
          on: {
            move: [
              {
                guard: { type: 'decidesActing', params: { next: 'moving' } },
                target: 'moving',
                actions: ['flushTap', 'decideActing'],
              },
              {
                guard: { type: 'decidesActing', params: { next: 'ignoring' } },
                target: 'ignoring',
                actions: 'flushTap',
              },
            ],
            up: [
              {
                guard: { type: 'liftsActing', params: { next: 'continue' } },
                actions: 'liftActing',
              },
              {
                guard: not('isHold'),
                target: 'idle',
                actions: 'liftActing',
              },
            ],
          },
        },
        moving: {
          on: {
            move: {
              guard: 'inClaim',
              actions: { type: 'follow', params: { phase: 'move' } },
            },
            up: [
              {
                guard: and(['inClaim', not('noActing')]),
                target: 'ignoring',
                actions: { type: 'follow', params: { phase: 'end' } },
              },
              {
                guard: 'inClaim',
                target: 'idle',
                actions: { type: 'follow', params: { phase: 'end' } },
              },
            ],
          },
        },
        tapped: {
          after: {
            [DOUBLE_TAP_GAP_MS]: { target: 'idle', actions: 'flushTap' },
          },
          on: { down: { target: 'pressing', actions: 'resetPress' } },
        },
        /** Acting fingers that make nothing; the Hold stays locked. */
        ignoring: {
          always: { guard: 'noActing', target: 'idle' },
        },
      },
    },
    /** The browser is scrolling this touch. */
    native: {
      always: { guard: 'noPointers', target: 'idle' },
    },
    /** Not a gesture; wait for every finger to lift. */
    ignoring: {
      on: { down: { actions: 'capture' } },
      always: { guard: 'noPointers', target: 'idle' },
    },
  },
});
