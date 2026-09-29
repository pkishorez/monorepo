import { assign, setup } from 'xstate';
import type { FingerSample, Point } from '../gesture-reading';
import { AXIS_LOCK_PX } from '../swipe-reading';

/** Whether a Gesture is under the Hold. */
export type Hold = boolean;

// How far a finger moves before it acts rather than settles. A Tap moves
// less; a Swipe fixes its axis here.
const MOVE_PX = AXIS_LOCK_PX;

/**
 * How long a finger must press still in the Hold Zone to start the Hold
 * when a two-finger Gesture is also expected; fingers of a pinch land well
 * within it. A finger in the Hold Zone pressed longer is never a Tap.
 */
export const HOLD_PRESS_MS = 200;

type Finger = { readonly landed: Point; readonly at: Point };

/**
 * What the machine asks of the Gesture it decides on: begin one, with or
 * without the Hold, let a finger join, move or leave it, or end it as
 * interrupted. `held` tells that the Hold came on, `pressed` when it took a
 * press.
 */
export type ZoneOutput = {
  readonly begin: (hold: Hold, finger: FingerSample) => void;
  readonly join: (finger: FingerSample) => void;
  readonly move: (finger: FingerSample) => void;
  readonly leave: (finger: FingerSample) => void;
  readonly interrupt: () => void;
  readonly held: (pressed: boolean) => void;
};

export type ZoneInput = {
  /** Whether a point in viewport px is in the Hold Zone. */
  readonly inHoldZone: (point: Point) => boolean;
  /** Whether any enabled listener takes Gestures under the Hold. */
  readonly wantsHold: () => boolean;
  /** Whether any enabled listener with no Hold reads two-finger Gestures. */
  readonly wantsPinch: () => boolean;
  readonly output: ZoneOutput;
};

type ZoneContext = ZoneInput & {
  readonly fingers: ReadonlyMap<number, Finger>;
  /** The Hold finger while it is down. */
  readonly holder: number | undefined;
};

export type ZoneEvent =
  | { readonly type: 'finger.down'; readonly finger: FingerSample }
  | { readonly type: 'finger.move'; readonly finger: FingerSample }
  | { readonly type: 'finger.up'; readonly finger: FingerSample }
  | { readonly type: 'cancel' };

// Whether `finger` has now moved far enough from where it landed to act.
const acts = (context: ZoneContext, finger: FingerSample) => {
  const landed = context.fingers.get(finger.id)?.landed ?? finger;
  return Math.hypot(finger.x - landed.x, finger.y - landed.y) >= MOVE_PX;
};

// Whether a finger landing at `point` can become the Hold at all.
const holdable = (context: ZoneContext, point: Point) =>
  context.inHoldZone(point) && context.wantsHold();

/**
 * The Gesture Zone's phases, fed every finger on the zone. With no listener
 * under the Hold, every touch is ordinary. Otherwise a first finger landing
 * in the Hold Zone can start the Hold: at once when a second finger lands,
 * or, when a two-finger Gesture is also expected, after pressing still for
 * HOLD_PRESS_MS, so that fingers landing together are still a pinch. Until
 * then it is ordinary: lifting, it is a Tap that clicks; moving, a Gesture.
 * The Hold lasts until every finger lifts.
 */
export const zoneMachine = setup({
  types: {
    context: {} as ZoneContext,
    events: {} as ZoneEvent,
    input: {} as ZoneInput,
  },
  delays: { press: HOLD_PRESS_MS },
  actions: {
    /** Follows the event's finger: where it landed and where it is now. */
    track: assign(({ context, event }) => {
      if (event.type === 'cancel') return {};
      const { id, x, y } = event.finger;
      const fingers = new Map(context.fingers);
      const landed = fingers.get(id)?.landed ?? { x, y };
      if (event.type !== 'finger.up') {
        fingers.set(id, { landed, at: { x, y } });
        return { fingers };
      }
      fingers.delete(id);
      return {
        fingers,
        holder: id === context.holder ? undefined : context.holder,
      };
    }),
    /** The one finger down becomes the Hold finger. */
    hold: assign({
      holder: ({ context }) => context.fingers.keys().next().value,
    }),
    move: ({ context, event }) => {
      if (event.type === 'finger.move') context.output.move(event.finger);
    },
    join: ({ context, event }) => {
      if (event.type === 'finger.down') context.output.join(event.finger);
    },
    leave: ({ context, event }) => {
      if (event.type === 'finger.up') context.output.leave(event.finger);
    },
    beginPlain: ({ context, event }) => {
      if (event.type === 'finger.down') {
        context.output.begin(false, event.finger);
      }
    },
    beginHeld: ({ context, event }) => {
      if (event.type === 'finger.down') {
        context.output.begin(true, event.finger);
      }
    },
  },
  guards: {
    acts: ({ context, event }) =>
      event.type !== 'cancel' && acts(context, event.finger),
    instantHold: ({ context, event }) =>
      event.type === 'finger.down' &&
      holdable(context, event.finger) &&
      !context.wantsPinch(),
    pressHold: ({ context, event }) =>
      event.type === 'finger.down' && holdable(context, event.finger),
    isHolder: ({ context, event }) =>
      event.type !== 'cancel' && event.finger.id === context.holder,
    lastFinger: ({ context }) => context.fingers.size === 1,
    lastBesideHolder: ({ context }) =>
      context.holder !== undefined && context.fingers.size === 2,
  },
}).createMachine({
  id: 'zone',
  context: ({ input }) => ({ ...input, fingers: new Map(), holder: undefined }),
  initial: 'idle',
  on: {
    cancel: {
      target: '.idle',
      actions: [
        ({ context }) => context.output.interrupt(),
        assign({ fingers: () => new Map(), holder: undefined }),
      ],
    },
  },
  states: {
    idle: {
      description: 'No finger is on the zone.',
      on: {
        'finger.down': [
          {
            guard: 'instantHold',
            target: 'armed',
            actions: ['track', 'beginPlain'],
          },
          {
            guard: 'pressHold',
            target: 'arming',
            actions: ['track', 'beginPlain'],
          },
          { target: 'pressing', actions: ['track', 'beginPlain'] },
        ],
      },
    },
    armed: {
      description:
        'One still finger in the Hold Zone, with no pinch expected: another finger landing starts the Hold.',
      on: {
        'finger.move': [
          { guard: 'acts', target: 'moving', actions: ['track', 'move'] },
          { actions: ['track', 'move'] },
        ],
        'finger.down': {
          target: 'held.acting',
          actions: [
            'hold',
            'track',
            ({ context }) => {
              context.output.interrupt();
              context.output.held(false);
            },
            'beginHeld',
          ],
        },
      },
      initial: 'quick',
      states: {
        quick: {
          description: 'Lifting now is a Tap that clicks.',
          after: { press: 'lingering' },
          on: {
            'finger.up': { target: '#zone.idle', actions: ['track', 'leave'] },
          },
        },
        lingering: {
          description:
            'Pressed too long for a Tap: lifting now does nothing and clicks nothing.',
          on: {
            'finger.up': {
              target: '#zone.idle',
              actions: ['track', ({ context }) => context.output.interrupt()],
            },
          },
        },
      },
    },
    arming: {
      description:
        'One still finger pressing in the Hold Zone while a pinch is expected: the Hold starts if it stays still long enough.',
      after: {
        press: {
          target: 'held.waiting',
          actions: [
            'hold',
            ({ context }) => {
              context.output.interrupt();
              context.output.held(true);
            },
          ],
        },
      },
      on: {
        'finger.move': [
          { guard: 'acts', target: 'moving', actions: ['track', 'move'] },
          { actions: ['track', 'move'] },
        ],
        'finger.down': { target: 'multi', actions: ['track', 'join'] },
        'finger.up': { target: 'idle', actions: ['track', 'leave'] },
      },
    },
    pressing: {
      description: 'One finger, still: lifting it is a Tap that clicks.',
      on: {
        'finger.move': [
          { guard: 'acts', target: 'moving', actions: ['track', 'move'] },
          { actions: ['track', 'move'] },
        ],
        'finger.down': { target: 'multi', actions: ['track', 'join'] },
        'finger.up': { target: 'idle', actions: ['track', 'leave'] },
      },
    },
    moving: {
      description: 'One finger moving: a Gesture, its Pan and its Swipe.',
      on: {
        'finger.move': { actions: ['track', 'move'] },
        'finger.down': { target: 'multi', actions: ['track', 'join'] },
        'finger.up': { target: 'idle', actions: ['track', 'leave'] },
      },
    },
    multi: {
      description: 'Several fingers with no Hold: pinch and rotate.',
      on: {
        'finger.move': { actions: ['track', 'move'] },
        'finger.down': { actions: ['track', 'join'] },
        'finger.up': [
          { guard: 'lastFinger', target: 'idle', actions: ['track', 'leave'] },
          { actions: ['track', 'leave'] },
        ],
      },
    },
    held: {
      description:
        'The Hold is on until every finger lifts: every Gesture the other fingers make is under it.',
      initial: 'acting',
      states: {
        acting: {
          description: 'A Gesture under the Hold is under way.',
          on: {
            'finger.move': [
              { guard: 'isHolder', actions: 'track' },
              { actions: ['track', 'move'] },
            ],
            'finger.down': { actions: ['track', 'join'] },
            'finger.up': [
              { guard: 'isHolder', actions: 'track' },
              {
                guard: 'lastFinger',
                target: '#zone.idle',
                actions: ['track', 'leave'],
              },
              {
                guard: 'lastBesideHolder',
                target: 'waiting',
                actions: ['track', 'leave'],
              },
              { actions: ['track', 'leave'] },
            ],
          },
        },
        waiting: {
          description: 'Only the Hold finger is down.',
          on: {
            'finger.move': { actions: 'track' },
            'finger.down': {
              target: 'acting',
              actions: ['track', 'beginHeld'],
            },
            'finger.up': { target: '#zone.idle', actions: 'track' },
          },
        },
      },
    },
  },
});
