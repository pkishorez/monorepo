import {
  type Direction,
  type Directions,
  directionOf,
  SLOP,
  wants,
} from '../direction/index.ts';
import {
  createPointers,
  type Pointer,
  type PointerSample,
  type Pointers,
} from './pointers.ts';

export type { Pointer, PointerSample, Pointers } from './pointers.ts';

/**
 * How the provider finds its way around the zones, on whatever platform
 * they live: the innermost zone around what a finger landed on, the zone
 * around a zone, and whether a zone is Trapped right now. The web reads
 * these from the DOM; a phone from its own view tree.
 */
export type ZoneTree<Zone, Target> = {
  readonly zoneOf: (target: Target) => Zone | null;
  readonly parentOf: (zone: Zone) => Zone | null;
  readonly trapped: (zone: Zone) => boolean;
};

/**
 * How a Gesture ended. `interrupted` when the touch source took the touch,
 * the app lost focus, or another zone took it, rather than the last finger
 * lifting. `preventClick` stops the last finger's release from also clicking
 * what is under it; call it during `end`. Otherwise the platform decides
 * whether it clicks.
 */
export type GestureEnd = {
  readonly interrupted: boolean;
  readonly preventClick: () => void;
};

export type GestureListener<Target> = {
  /** Whether it takes the next Gesture, read as the first finger lands. */
  readonly enabled: () => boolean;
  readonly start: (pointers: Pointers<Target>) => void;
  /** A finger landed or lifted. */
  readonly pointer: (
    pointer: Pointer<Target>,
    pointers: Pointers<Target>,
  ) => void;
  /** A finger that is down moved. */
  readonly move?: (
    pointer: Pointer<Target>,
    pointers: Pointers<Target>,
  ) => void;
  readonly end: (pointers: Pointers<Target>, end: GestureEnd) => void;
  /**
   * Whether it captures a touch whose first finger landed at `point`, even
   * over a Native Scroll. Read at the touch's first movement.
   */
  readonly captures?: (point: {
    readonly x: number;
    readonly y: number;
  }) => boolean;
  /**
   * The side edge it keeps from the platform's edge swipe whenever it is
   * enabled, whether or not it would take a touch there. Read as a touch
   * lands; it never decides who takes the Gesture.
   */
  readonly guardsEdge?: () => 'left' | 'right' | undefined;
  /** The Directions it takes touches in. Read at the touch's first movement. */
  readonly directions?: () => Directions | undefined;
  /**
   * Whether it acts on what it hears, rather than only watching: when
   * another zone takes the Gesture, it drops it. False by default.
   */
  readonly acts?: () => boolean;
  /** The Gesture first moved in `direction`. */
  readonly direction?: (direction: Direction) => void;
};

/**
 * Where a touch source feeds its fingers. `down`, `move`, `up` and
 * `cancelAll` are all a plain source needs: the Direction is then read
 * once a finger has moved SLOP px. A source that decides ownership itself,
 * as the browser's touch events do, marks its moves `undecided` and calls
 * `pick` and `settle` at the touch's first movement.
 */
export type PointerSink<Target> = {
  /** Whether a Gesture is under way. */
  readonly active: () => boolean;
  /** A finger landed; returns whether it is now tracked. */
  readonly down: (sample: PointerSample<Target>) => boolean;
  readonly move: (sample: PointerSample<Target>) => void;
  /**
   * A tracked finger lifted; returns whether its release must not also
   * click what is under it.
   */
  readonly up: (sample: PointerSample<Target>) => boolean;
  /**
   * The source took the touch, or the app lost focus: every finger lifts
   * where it is at `t`, on the samples' clock, and the Gesture ends
   * interrupted.
   */
  readonly cancelAll: (t: number) => void;
  /** The Direction of the Gesture under way, once it is read. */
  readonly direction: () => Direction | undefined;
  /**
   * How a zone would take the Gesture under way if it first moved in
   * `direction`: a listener captures where its first finger landed, or one
   * wants that Direction. None when no listener would take it.
   */
  readonly pick: (
    direction: Direction | undefined,
  ) => 'captures' | 'directions' | undefined;
  /**
   * The Gesture first moved in `direction`: tell every listener, and leave
   * it with the zone that takes it. Once per Gesture.
   */
  readonly settle: (direction: Direction | undefined) => void;
  /**
   * Whether a listener of the Gesture under way could take a touch landing
   * at `point`: it captures there, or wants `inward`; or one guards the edge
   * `inward` leads away from.
   */
  readonly claimsEdge: (
    point: { readonly x: number; readonly y: number },
    inward: Direction,
  ) => boolean;
};

/**
 * A Gesture Provider, on any platform: the one Gesture under way, and the
 * listeners of each of its zones. A touch source feeds it fingers through
 * `sink`; `zones` tells it how zones nest. When a first finger lands in one
 * of its zones, the Gesture is heard by that zone and each zone above it, up
 * to and including the first trapped one; every enabled listener of those
 * zones takes it. At its first movement one zone takes it: the innermost
 * whose listener captures where the first finger landed, or else the
 * innermost with a listener that wants its Direction. Listeners that act in
 * the other zones then drop it; those that only watch keep it. Every later
 * finger joins it, unless it lands in another provider's zone. Whether the
 * last finger's release clicks what is under it is the platform's call,
 * unless a listener prevents it.
 */
export const createGestureProvider = <Zone, Target>(
  tree: ZoneTree<Zone, Target>,
) => {
  type Listener = GestureListener<Target>;
  type Taking = { readonly zone: Zone; readonly listener: Listener };

  const zones = new Set<Zone>();
  const listeners = new Map<Zone, Set<Listener>>();
  const fingers = createPointers<Target>();
  let taking: ReadonlyArray<Taking> = [];
  // Whether the Gesture under way has first moved, and which way.
  let settled = false;
  let direction: Direction | undefined;

  // The zones that hear a Gesture starting on `target`, innermost first.
  const hearing = (target: Target) => {
    const heard: Array<Zone> = [];
    let zone = tree.zoneOf(target);
    while (zone !== null && zones.has(zone)) {
      heard.push(zone);
      if (tree.trapped(zone)) break;
      zone = tree.parentOf(zone);
    }
    return heard;
  };

  // Ends the Gesture; returns whether it must not click.
  const finish = (interrupted: boolean) => {
    const pointers = fingers.pointers();
    let prevented = false;
    const end = { interrupted, preventClick: () => (prevented = true) };
    for (const { listener } of taking) listener.end(pointers, end);
    taking = [];
    settled = false;
    direction = undefined;
    fingers.clear();
    return prevented;
  };

  // The zone that takes the Gesture if it moves in `way`, and how: first
  // the innermost that captures where it landed, then the innermost that
  // wants `way`. `taking` lists zones innermost first.
  const pick = (way: Direction | undefined) => {
    const [first] = fingers.pointers().values();
    if (first === undefined) return undefined;
    const capturing = taking.find(
      ({ listener }) => listener.captures?.(first.start) === true,
    );
    if (capturing) return { zone: capturing.zone, how: 'captures' as const };
    const wanting = taking.find(({ listener }) =>
      wants(listener.directions?.(), way),
    );
    if (wanting) return { zone: wanting.zone, how: 'directions' as const };
    return undefined;
  };

  const settle = (way: Direction | undefined) => {
    if (settled || !fingers.active()) return;
    settled = true;
    direction = way;
    const taker = pick(way);
    const dropped = taking.filter(
      ({ zone, listener }) =>
        taker !== undefined &&
        zone !== taker.zone &&
        listener.acts?.() === true,
    );
    // A dropped listener never hears a Direction it wanted, or it would
    // start acting on a touch it is about to lose.
    const told = taking.filter(
      (entry) =>
        !dropped.includes(entry) || !wants(entry.listener.directions?.(), way),
    );
    if (way !== undefined) {
      for (const { listener } of told) listener.direction?.(way);
    }
    taking = taking.filter((entry) => !dropped.includes(entry));
    const end = { interrupted: true, preventClick: () => {} };
    for (const { listener } of dropped) listener.end(fingers.pointers(), end);
  };

  const sink: PointerSink<Target> = {
    active: fingers.active,
    down: (sample) => {
      const starting = !fingers.active();
      if (starting) {
        const heard = hearing(sample.target);
        if (heard.length === 0) return false;
        taking = heard
          .flatMap((zone) =>
            [...(listeners.get(zone) ?? [])].map((listener) => ({
              zone,
              listener,
            })),
          )
          .filter(({ listener }) => listener.enabled());
      } else {
        // Another provider's zone keeps its own fingers.
        const zone = tree.zoneOf(sample.target);
        if (zone !== null && !zones.has(zone)) return false;
      }
      const pointer = fingers.down(sample);
      if (pointer === undefined) return false;
      if (starting) {
        for (const { listener } of taking) listener.start(fingers.pointers());
      }
      for (const { listener } of taking) {
        listener.pointer(pointer, fingers.pointers());
      }
      return true;
    },
    move: (sample) => {
      const pointer = fingers.move(sample);
      if (pointer === undefined) return;
      for (const { listener } of taking) {
        listener.move?.(pointer, fingers.pointers());
      }
      // With no source to read it first, such as a pen in a browser, the
      // Direction is read once a pointer has moved SLOP px.
      if (settled || sample.undecided) return;
      if (Math.hypot(pointer.dx, pointer.dy) >= SLOP) {
        settle(directionOf(pointer.dx, pointer.dy));
      }
    },
    up: (sample) => {
      const pointer = fingers.up(sample);
      if (pointer === undefined) return false;
      for (const { listener } of taking) {
        listener.pointer(pointer, fingers.pointers());
      }
      return fingers.active() ? true : finish(false);
    },
    direction: () => direction,
    pick: (way) => pick(way)?.how,
    settle,
    claimsEdge: (point, inward) =>
      taking.some(
        ({ listener }) =>
          listener.guardsEdge?.() === (inward === 'right' ? 'left' : 'right') ||
          listener.captures?.(point) === true ||
          wants(listener.directions?.(), inward),
      ),
    cancelAll: (t) => {
      if (!fingers.active()) return;
      fingers.lift(t);
      finish(true);
    },
  };

  return {
    sink,
    /** Makes `zone` one of this provider's zones; returns the removal. */
    addZone: (zone: Zone) => {
      zones.add(zone);
      return () => {
        zones.delete(zone);
      };
    },
    /** Adds a listener to `zone`; returns the removal. */
    addGesture: (zone: Zone, listener: Listener) => {
      const own = listeners.get(zone) ?? new Set();
      own.add(listener);
      listeners.set(zone, own);
      return () => {
        own.delete(listener);
        if (own.size === 0) listeners.delete(zone);
        taking = taking.filter((other) => other.listener !== listener);
      };
    },
  };
};

export type GestureProvider<Zone, Target> = ReturnType<
  typeof createGestureProvider<Zone, Target>
>;
