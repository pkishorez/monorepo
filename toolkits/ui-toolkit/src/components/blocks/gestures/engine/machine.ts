import { and, assign, enqueueActions, not, setup, stateIn } from 'xstate';
import {
  actingTracks,
  type Claim,
  claimActing,
  decideActing,
  decideActingLift,
  decideLift,
  decideMovement,
  FRESH_PRESS,
  leans,
  type Locked,
  lockOnExpiry,
  lockOnLift,
  lockOnMovement,
  type Press,
  type Situation,
  tapOf,
} from './decide';
import { claimTracks, holdEvent, movementEvent, regroup } from './events';
import { pointOf } from './group';
import type { PointerTracker } from './pointers';
import { TAP_MAX_MS } from './thresholds';
import type {
  GestureEvent,
  Phase,
  Policy,
  Scroll,
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
  /** The app owns this touch until every finger lifts: 2+ fingers, a claim or a Hold. */
  captured: boolean;
  /** One finger inside the slop heading for a claim at a scroller's end. */
  leaning: boolean;
};

const gesture = (event: GestureEvent) => ({ type: 'gesture' as const, event });

const situation = (context: Context): Situation => context;

const ownsClick = (context: Context) =>
  !context.captured && context.start?.nativeTap === true;

/**
 * The whole gesture model as one machine. Nothing is decided as fingers land
 * (`pressing`). The first finger down staying still while one landed after
 * it moves past the slop or taps locks it as the Hold (`held`): like a held
 * Shift key it modifies every tap and movement of the other fingers until it
 * lifts, however far it wanders. Otherwise the first movement past the slop
 * decides: one finger pans or swipes (`moving`), or along the scroll axis is
 * left to the browser (`native`); two fingers moving together Pinch or pan. Fingers that
 * land and lift quickly tap. A gesture stays what it was classified as until
 * the last of its fingers lifts: one of them may lift and land again. Anything
 * else, or the browser taking a pointer, leaves the rest of the touch to
 * `ignoring`.
 */
export const gestureMachine = setup({
  types: {
    context: {} as Context,
    events: {} as MachineEvent,
    input: {} as MachineInput,
    emitted: {} as ReturnType<typeof gesture>,
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
    locksOnMove: ({ context, event }, params: { readonly next: string }) => {
      const hold = lockOnMovement(situation(context), event.track);
      if (hold === undefined) return false;
      const claim = claimActing({ ...situation(context), hold });
      return (claim === undefined ? 'ignoring' : 'moving') === params.next;
    },
    locksOnLift: ({ context, event }) =>
      lockOnLift(situation(context), context.press, event.track) !== undefined,
    locksOnExpiry: ({ context }) =>
      lockOnExpiry(situation(context), context.press) !== undefined,
    // Only one finger is down.
    alone: ({ context }) => context.pointers.size() === 1,
    pair: ({ context }) => context.pointers.size() === 2,
    isHold: ({ context, event }) => event.track.id === context.hold?.id,
    inClaim: ({ context, event }) =>
      context.claim?.ids.includes(event.track.id) ?? false,
    // Another of the claim's fingers is still down.
    claimStays: ({ context }) => (context.claim?.ids.length ?? 0) > 1,
    // A finger of the claim lifted earlier, so this one may take its place.
    joinsClaim: ({ context, event }) =>
      context.claim !== undefined &&
      event.track.id !== context.hold?.id &&
      context.claim.ids.length < context.claim.size,
    // A fourth finger with no Hold, or a third acting finger under one.
    tooMany: ({ context }) =>
      context.hold === undefined
        ? context.pointers.size() > 3
        : actingTracks(situation(context)).length > 2,
    noPointers: ({ context }) => context.pointers.size() === 0,
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
    // A finger landing beside one that tapped makes it no tap at all.
    spoilTapped: assign({
      press: ({ context }) =>
        context.press.tappers.length > 0
          ? { tappers: [], spoiled: true }
          : context.press,
    }),
    /** Locks the first finger down as the Hold, as the others first move, and claims their gesture. */
    lockOnMove: enqueueActions(({ context, event, enqueue }) => {
      const hold = lockOnMovement(situation(context), event.track);
      if (hold === undefined) return;
      enqueue.assign({
        hold,
        captured: true,
        leaning: false,
        press: FRESH_PRESS,
      });
      enqueue.emit(gesture(holdEvent('lock', hold)));
      const held = { ...context, hold };
      const claim = claimActing(situation(held));
      if (claim === undefined) return;
      enqueue.assign({ claim });
      const start = movementEvent(claim, 'start', held, event.track);
      if (start !== undefined) enqueue.emit(gesture(start));
    }),
    /** Locks the first finger down as the Hold, as another taps beside it. */
    lockOnLift: enqueueActions(({ context, event, enqueue }) => {
      const hold = lockOnLift(situation(context), context.press, event.track);
      if (hold === undefined) return;
      enqueue.assign({ hold, captured: true, leaning: false });
      enqueue.emit(gesture(holdEvent('lock', hold)));
      const held = { ...context, hold };
      const lift = decideActingLift(
        situation(held),
        context.press,
        event.track,
      );
      if (lift?.next === 'tap') enqueue.emit(gesture(lift.tap));
      enqueue.assign({
        press: lift?.next === 'continue' ? lift.press : FRESH_PRESS,
      });
    }),
    /** Locks the first finger down as the Hold, once fingers that tapped beside it can no longer tap with it. */
    lockOnExpiry: enqueueActions(
      ({ context, enqueue }, params: { readonly landed: boolean }) => {
        const hold = lockOnExpiry(situation(context), context.press);
        if (hold === undefined) return;
        enqueue.assign({ hold, captured: true, leaning: false });
        enqueue.emit(gesture(holdEvent('lock', hold)));
        if (!params.landed && context.pointers.size() > 1) return;
        const tap = tapOf(context.press.tappers, hold);
        if (tap !== undefined) enqueue.emit(gesture(tap));
        enqueue.assign({ press: FRESH_PRESS });
      },
    ),
    /** Applies the first movement's decision: claims the gesture. */
    decide: enqueueActions(({ context, event, enqueue }) => {
      const decision = decideMovement(situation(context), event.track);
      if (decision?.next !== 'moving') return;
      enqueue.assign({ leaning: false });
      const start = movementEvent(
        decision.claim,
        'start',
        context,
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
    /** One of the claim's fingers lifted while another stays: the rest carry it on. */
    leaveClaim: assign({
      claim: ({ context, event }) => {
        const claim = context.claim;
        if (claim === undefined) return undefined;
        return regroup(
          claim,
          claimTracks(claim, context.pointers, event.track),
          claim.ids.filter((id) => id !== event.track.id),
          context.pointers,
        );
      },
    }),
    /** A finger landed again in place of one of the claim's that lifted. */
    joinClaim: assign({
      claim: ({ context, event }) => {
        const claim = context.claim;
        if (claim === undefined) return undefined;
        return regroup(
          claim,
          claimTracks(claim, context.pointers, event.track),
          [...claim.ids, event.track.id],
          context.pointers,
        );
      },
    }),
    /** Applies a lift of a press with no Hold: a tap once every finger is up. */
    lift: enqueueActions(({ context, event, enqueue }) => {
      const lift = decideLift(situation(context), context.press, event.track);
      if (lift.next === 'tap' && !ownsClick(context)) {
        enqueue.emit(gesture(lift.tap));
      } else if (lift.next === 'continue')
        enqueue.assign({ press: lift.press });
    }),
    liftActing: enqueueActions(({ context, event, enqueue }) => {
      const lift = decideActingLift(
        situation(context),
        context.press,
        event.track,
      );
      if (lift?.next === 'tap') enqueue.emit(gesture(lift.tap));
      else if (lift?.next === 'continue') {
        enqueue.assign({ press: lift.press });
      }
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
      start: undefined,
      claim: undefined,
      hold: undefined,
      press: FRESH_PRESS,
      leaning: false,
      captured: false,
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
    captured: false,
    leaning: false,
  }),
  initial: 'idle',
  always: {
    guard: and(['noPointers', not(stateIn('#gestures.idle'))]),
    target: '.idle',
    actions: [
      { type: 'follow', params: { phase: 'cancel' } },
      { type: 'endHold', params: { phase: 'cancel' } },
    ],
  },
  // The browser took a pointer, usually for a scroll.
  on: {
    cancel: {
      target: '.ignoring',
      actions: [
        { type: 'follow', params: { phase: 'cancel' } },
        { type: 'endHold', params: { phase: 'cancel' } },
      ],
    },
  },
  states: {
    idle: {
      entry: 'settle',
      on: { down: { target: 'pressing', actions: 'begin' } },
    },
    /** Fingers down, nothing moved yet. */
    pressing: {
      // Fingers that tapped beside the first one still down can no longer
      // tap together with it: it was a Hold.
      after: {
        [TAP_MAX_MS]: [
          {
            guard: and(['locksOnExpiry', 'alone']),
            target: 'held.idle',
            actions: { type: 'lockOnExpiry', params: { landed: false } },
          },
          {
            guard: 'locksOnExpiry',
            target: 'held.pressing',
            actions: { type: 'lockOnExpiry', params: { landed: false } },
          },
        ],
      },
      on: {
        down: [
          { guard: 'tooMany', target: 'ignoring', actions: 'capture' },
          {
            guard: and(['locksOnExpiry', 'pair']),
            target: 'held.pressing',
            actions: { type: 'lockOnExpiry', params: { landed: true } },
          },
          { actions: ['capture', 'spoilTapped'] },
        ],
        move: [
          {
            guard: { type: 'locksOnMove', params: { next: 'moving' } },
            target: 'held.moving',
            actions: 'lockOnMove',
          },
          {
            guard: { type: 'locksOnMove', params: { next: 'ignoring' } },
            target: 'held.ignoring',
            actions: 'lockOnMove',
          },
          {
            guard: { type: 'decides', params: { next: 'native' } },
            target: 'native',
          },
          {
            guard: { type: 'decides', params: { next: 'moving' } },
            target: 'moving',
            actions: 'decide',
          },
          {
            guard: { type: 'decides', params: { next: 'ignoring' } },
            target: 'ignoring',
          },
          { actions: 'lean' },
        ],
        up: [
          {
            guard: and(['locksOnLift', 'alone']),
            target: 'held.idle',
            actions: 'lockOnLift',
          },
          {
            guard: 'locksOnLift',
            target: 'held.pressing',
            actions: 'lockOnLift',
          },
          {
            guard: { type: 'lifts', params: { next: 'continue' } },
            actions: 'lift',
          },
          { target: 'idle', actions: 'lift' },
        ],
      },
    },
    /** A Pan, Swipe or Pinch with no Hold, Captured. Another finger is left out of it. */
    moving: {
      on: {
        down: [
          { guard: 'joinsClaim', actions: ['capture', 'joinClaim'] },
          { actions: 'capture' },
        ],
        move: {
          guard: 'inClaim',
          actions: { type: 'follow', params: { phase: 'move' } },
        },
        up: [
          { guard: and(['inClaim', 'claimStays']), actions: 'leaveClaim' },
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
    /**
     * The Hold is locked and the touch Captured. Inside, the other fingers
     * tap, pan, swipe and pinch, as often as they like.
     */
    held: {
      initial: 'idle',
      on: {
        move: { guard: 'isHold', actions: 'followHold' },
        // Lifting the Hold releases it, ending a gesture under way so a
        // flick still coasts.
        up: {
          guard: 'isHold',
          target: 'ignoring',
          actions: [
            { type: 'follow', params: { phase: 'end' } },
            { type: 'endHold', params: { phase: 'release' } },
          ],
        },
        down: [
          {
            guard: 'tooMany',
            target: 'ignoring',
            actions: [
              { type: 'follow', params: { phase: 'cancel' } },
              { type: 'endHold', params: { phase: 'cancel' } },
            ],
          },
        ],
      },
      states: {
        idle: {
          on: { down: { target: 'pressing', actions: 'resetPress' } },
        },
        pressing: {
          on: {
            move: [
              {
                guard: { type: 'decidesActing', params: { next: 'moving' } },
                target: 'moving',
                actions: 'decideActing',
              },
              {
                guard: { type: 'decidesActing', params: { next: 'ignoring' } },
                target: 'ignoring',
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
            down: { guard: 'joinsClaim', actions: 'joinClaim' },
            move: {
              guard: 'inClaim',
              actions: { type: 'follow', params: { phase: 'move' } },
            },
            up: [
              { guard: and(['inClaim', 'claimStays']), actions: 'leaveClaim' },
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
        /** Acting fingers that make nothing; the Hold stays locked. */
        ignoring: {
          always: { guard: 'noActing', target: 'idle' },
        },
      },
    },
    /** The browser is scrolling this touch. */
    native: {},
    /** Not a gesture; wait for every finger to lift. */
    ignoring: {
      on: { down: { actions: 'capture' } },
    },
  },
});
