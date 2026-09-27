import type {
  Combination,
  Direction,
  Fingers,
  MovementEvent,
  Side,
  TapEvent,
} from '../engine';

/** Which Hold a hook answers: none, one side, or either side. */
export type HoldOption = 'none' | 'left' | 'right' | 'any';

type Common = {
  readonly fingers: Fingers;
  readonly hold: HoldOption;
  /** Read at each decision, so turning a hook off needs no re-registering. */
  readonly enabled: () => boolean;
  /** A touch landed in the zone: stop an animation under way, the way a finger catches it. */
  readonly catch?: () => void;
  /** The touch that caught it ended without giving this hook a gesture. */
  readonly release?: () => void;
};

/** One hook's claim on a gesture, as a zone keeps it. */
export type Registration =
  | (Common & {
      readonly gesture: 'tap';
      readonly handle: (event: TapEvent) => void;
    })
  | (Common & {
      readonly gesture: 'pan';
      /** The one axis it moves along, if any. */
      readonly axis: 'x' | 'y' | undefined;
      readonly handle: (event: MovementEvent) => void;
    })
  | (Common & {
      readonly gesture: 'swipe';
      readonly direction: Direction;
      readonly edge: boolean;
      /** The directions it takes right now: its own, the way back, both, or none while busy. */
      readonly directions: () => ReadonlyArray<Direction>;
      /** Open and staying open (`after: 'stay'` at 1), so its way back comes first. */
      readonly opened: () => boolean;
      readonly handle: (event: MovementEvent) => void;
    })
  | (Common & {
      readonly gesture: 'pinch';
      readonly handle: (event: MovementEvent) => void;
    });

export const holdMatches = (option: HoldOption, hold: Side | undefined) =>
  option === 'any' ? hold !== undefined : option === (hold ?? 'none');

export const matches = (
  registration: Registration,
  combination: Combination,
): boolean =>
  registration.enabled() &&
  registration.fingers === combination.fingers &&
  holdMatches(registration.hold, combination.hold);

/** Whether two hooks answer some Hold in common. */
export const holdsOverlap = (a: HoldOption, b: HoldOption) =>
  a === b || (a === 'any' && b !== 'none') || (b === 'any' && a !== 'none');

export const isMover = (
  registration: Registration,
): registration is Extract<Registration, { gesture: 'pan' | 'swipe' }> =>
  registration.gesture === 'pan' || registration.gesture === 'swipe';

/** The edge strip an edge Swipe opens from: the one opposite its direction. */
export const stripOf = (direction: Direction): Side | undefined =>
  direction === 'right' ? 'left' : direction === 'left' ? 'right' : undefined;

export const describe = (registration: Registration): string => {
  const fingers = registration.fingers === 2 ? 'two fingers' : 'one finger';
  const hold =
    registration.hold === 'none'
      ? 'no Hold'
      : registration.hold === 'any'
        ? 'either Hold'
        : `a ${registration.hold} Hold`;
  return `${fingers} with ${hold}`;
};
