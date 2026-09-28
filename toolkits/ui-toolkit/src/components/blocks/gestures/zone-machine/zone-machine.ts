import { assign, setup } from 'xstate';
import type { FingerSample, Point } from '../gesture-reading';
import { AXIS_LOCK_PX } from '../swipe-reading';

/** Which side a Hold is on: the side of the still finger from the acting one. */
export type Side = 'left' | 'right';

/** Which Hold a Gesture is under: `none` when no Hold is on. */
export type Hold = 'none' | Side;

// How far a finger moves before it acts rather than settles. A Tap moves
// less; a Swipe fixes its axis here.
const MOVE_PX = AXIS_LOCK_PX;

// How far the other finger may have drifted and still become the Hold.
export const STILL_PX = 4;

type Finger = { readonly landed: Point; readonly at: Point };

/**
 * What the machine asks of the Gesture it decides on: begin one under a
 * Hold, let a finger join, move or leave it, or end it as interrupted.
 */
export type ZoneOutput = {
  readonly begin: (hold: Hold, finger: FingerSample) => void;
  readonly join: (finger: FingerSample) => void;
  readonly move: (finger: FingerSample) => void;
  readonly leave: (finger: FingerSample) => void;
  readonly interrupt: () => void;
};

export type ZoneInput = {
  /** Whether a still finger can become a Hold. Read as a second finger lands. */
  readonly holds: () => boolean;
  readonly output: ZoneOutput;
};

type ZoneContext = ZoneInput & {
  readonly fingers: ReadonlyMap<number, Finger>;
  readonly hold: Hold;
  /** The Hold finger while it is down. */
  readonly holder: number | undefined;
};

export type ZoneEvent =
  | { readonly type: 'finger.down'; readonly finger: FingerSample }
  | { readonly type: 'finger.move'; readonly finger: FingerSample }
  | { readonly type: 'finger.up'; readonly finger: FingerSample }
  | { readonly type: 'cancel' };

const drift = (from: Point, to: Point) =>
  Math.hypot(to.x - from.x, to.y - from.y);

const landedAt = (context: ZoneContext, finger: FingerSample) =>
  context.fingers.get(finger.id)?.landed ?? finger;

// Whether `finger` has now moved far enough from where it landed to act.
const acts = (context: ZoneContext, finger: FingerSample) =>
  drift(landedAt(context, finger), finger) >= MOVE_PX;

// The one other finger down, when it has stayed where it landed.
const stillOther = (context: ZoneContext, finger: FingerSample) => {
  for (const [id, other] of context.fingers) {
    if (id !== finger.id) {
      return drift(other.landed, other.at) < STILL_PX ? id : undefined;
    }
  }
  return undefined;
};

const sideOf = (held: Point, acting: Point): Side =>
  held.x <= acting.x ? 'left' : 'right';

// The finger as it landed, so a Gesture begun later loses none of its way.
const asLanded = (context: ZoneContext, finger: FingerSample) => ({
  ...finger,
  ...landedAt(context, finger),
});

/**
 * The Gesture Zone's phases, fed every finger on the zone. One finger is an
 * ordinary Gesture; a second makes it wait to see which one acts. When one
 * moves or taps while the other has stayed still, the still one is the Hold,
 * on its side of the acting finger, until every finger lifts. Two fingers
 * moving are a pinch, and nothing becomes a Hold until every finger lifts.
 */
export const zoneMachine = setup({
  types: {
    context: {} as ZoneContext,
    events: {} as ZoneEvent,
    input: {} as ZoneInput,
  },
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
    /** Locks the Hold on the still finger beside the event's acting one. */
    lock: assign(({ context, event }) => {
      if (event.type === 'cancel') return {};
      const holder = stillOther(context, event.finger);
      const held =
        holder === undefined ? undefined : context.fingers.get(holder);
      if (held === undefined) return {};
      return {
        holder,
        hold: sideOf(held.landed, landedAt(context, event.finger)),
      };
    }),
  },
}).createMachine({
  id: 'zone',
  context: ({ input }) => ({
    ...input,
    fingers: new Map(),
    hold: 'none',
    holder: undefined,
  }),
  initial: 'idle',
  on: {
    cancel: {
      target: '.idle',
      actions: [
        ({ context }) => context.output.interrupt(),
        assign({ fingers: () => new Map(), hold: 'none', holder: undefined }),
      ],
    },
  },
  states: {
    idle: {
      description: 'No finger is on the zone.',
      on: {
        'finger.down': {
          target: 'pressing',
          actions: [
            'track',
            ({ context, event }) => context.output.begin('none', event.finger),
          ],
        },
      },
    },
    pressing: {
      description: 'One finger, still: lifting it is a Tap that clicks.',
      on: {
        'finger.move': [
          {
            guard: ({ context, event }) => acts(context, event.finger),
            target: 'moving',
            actions: [
              'track',
              ({ context, event }) => context.output.move(event.finger),
            ],
          },
          {
            actions: [
              'track',
              ({ context, event }) => context.output.move(event.finger),
            ],
          },
        ],
        'finger.down': [
          {
            guard: ({ context }) => context.holds(),
            target: 'deciding',
            actions: [
              'track',
              ({ context, event }) => context.output.join(event.finger),
            ],
          },
          {
            target: 'multi',
            actions: [
              'track',
              ({ context, event }) => context.output.join(event.finger),
            ],
          },
        ],
        'finger.up': {
          target: 'idle',
          actions: [
            'track',
            ({ context, event }) => context.output.leave(event.finger),
          ],
        },
      },
    },
    moving: {
      description: 'One finger moving: a Gesture and its Swipe.',
      on: {
        'finger.move': {
          actions: [
            'track',
            ({ context, event }) => context.output.move(event.finger),
          ],
        },
        'finger.down': {
          target: 'multi',
          actions: [
            'track',
            ({ context, event }) => context.output.join(event.finger),
          ],
        },
        'finger.up': {
          target: 'idle',
          actions: [
            'track',
            ({ context, event }) => context.output.leave(event.finger),
          ],
        },
      },
    },
    deciding: {
      description:
        'Two fingers, neither acting yet: the first to act beside a still one makes that one the Hold.',
      on: {
        'finger.move': [
          {
            guard: ({ context, event }) =>
              acts(context, event.finger) &&
              stillOther(context, event.finger) !== undefined,
            target: 'held.acting',
            actions: [
              'lock',
              'track',
              ({ context, event }) => {
                context.output.interrupt();
                context.output.begin(
                  context.hold,
                  asLanded(context, event.finger),
                );
                context.output.move(event.finger);
              },
            ],
          },
          {
            guard: ({ context, event }) => acts(context, event.finger),
            target: 'multi',
            actions: [
              'track',
              ({ context, event }) => context.output.move(event.finger),
            ],
          },
          {
            actions: [
              'track',
              ({ context, event }) => context.output.move(event.finger),
            ],
          },
        ],
        'finger.up': [
          {
            guard: ({ context, event }) =>
              !acts(context, event.finger) &&
              stillOther(context, event.finger) !== undefined,
            target: 'held.waiting',
            actions: [
              'lock',
              ({ context, event }) => {
                context.output.interrupt();
                context.output.begin(
                  context.hold,
                  asLanded(context, event.finger),
                );
                context.output.leave(event.finger);
              },
              'track',
            ],
          },
          {
            target: 'multi',
            actions: [
              'track',
              ({ context, event }) => context.output.leave(event.finger),
            ],
          },
        ],
        'finger.down': {
          target: 'multi',
          actions: [
            'track',
            ({ context, event }) => context.output.join(event.finger),
          ],
        },
      },
    },
    held: {
      description:
        'A Hold is on until every finger lifts: every Gesture the other fingers make is under it.',
      initial: 'acting',
      exit: assign({ hold: 'none', holder: undefined }),
      states: {
        acting: {
          description: 'A Gesture under the Hold is under way.',
          on: {
            'finger.move': [
              {
                guard: ({ context, event }) =>
                  event.finger.id === context.holder,
                actions: 'track',
              },
              {
                actions: [
                  'track',
                  ({ context, event }) => context.output.move(event.finger),
                ],
              },
            ],
            'finger.down': {
              actions: [
                'track',
                ({ context, event }) => context.output.join(event.finger),
              ],
            },
            'finger.up': [
              {
                guard: ({ context, event }) =>
                  event.finger.id === context.holder,
                actions: 'track',
              },
              {
                guard: ({ context }) => context.fingers.size === 1,
                target: '#zone.idle',
                actions: [
                  'track',
                  ({ context, event }) => context.output.leave(event.finger),
                ],
              },
              {
                guard: ({ context }) =>
                  context.holder !== undefined && context.fingers.size === 2,
                target: 'waiting',
                actions: [
                  'track',
                  ({ context, event }) => context.output.leave(event.finger),
                ],
              },
              {
                actions: [
                  'track',
                  ({ context, event }) => context.output.leave(event.finger),
                ],
              },
            ],
          },
        },
        waiting: {
          description: 'Only the Hold finger is down.',
          on: {
            'finger.move': { actions: 'track' },
            'finger.down': {
              target: 'acting',
              actions: [
                'track',
                ({ context, event }) =>
                  context.output.begin(context.hold, event.finger),
              ],
            },
            'finger.up': { target: '#zone.idle', actions: 'track' },
          },
        },
      },
    },
    multi: {
      description: 'Several fingers with no Hold: pinch and rotate.',
      on: {
        'finger.move': {
          actions: [
            'track',
            ({ context, event }) => context.output.move(event.finger),
          ],
        },
        'finger.down': {
          actions: [
            'track',
            ({ context, event }) => context.output.join(event.finger),
          ],
        },
        'finger.up': [
          {
            guard: ({ context }) => context.fingers.size === 1,
            target: 'idle',
            actions: [
              'track',
              ({ context, event }) => context.output.leave(event.finger),
            ],
          },
          {
            actions: [
              'track',
              ({ context, event }) => context.output.leave(event.finger),
            ],
          },
        ],
      },
    },
  },
});
