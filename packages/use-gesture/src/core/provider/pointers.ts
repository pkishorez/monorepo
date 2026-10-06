/**
 * A point in px at time `t`, in ms since the Gesture's first finger
 * landed.
 */
export type Sample = {
  readonly x: number;
  readonly y: number;
  readonly t: number;
};

/**
 * One finger's position from a touch source, in px at time `t` in ms on the
 * source's own clock, and what it landed on: a DOM element on the web, a
 * view on a phone. The core never looks inside `target`; only the Zone Tree
 * the provider is made with does.
 */
export type PointerSample<Target> = {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly target: Target;
  /**
   * The source decides who owns this finger and its Direction later, so a
   * move must not decide either first.
   */
  readonly undecided?: boolean;
};

/**
 * One finger of a Gesture, from landing until the Gesture ends, as it was
 * at the last change. `target` is what it landed on. `x` and `y` are where
 * it is now; `dx` and `dy` how far it is from where it landed. They keep
 * where it lifted after. `end` is set once it lifts. Each change makes a new
 * Pointer; `start` stays the same object for the whole Gesture.
 */
export type Pointer<Target> = {
  readonly id: number;
  readonly target: Target;
  readonly start: Sample;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly end?: Sample;
};

/** Every finger of a Gesture, by id, in the order they landed. */
export type Pointers<Target> = ReadonlyMap<number, Pointer<Target>>;

/**
 * Reads one Gesture from a touch source: every finger that lands between
 * the first landing and the last lifting. Times count from the first
 * landing. Each change makes a new map; `down`, `move` and `up` return the
 * Pointer that changed, or none when the sample was not the Gesture's.
 */
export const createPointers = <Target>() => {
  let pointers: Pointers<Target> = new Map();
  // The first landing's time, on the source's own clock.
  let zero = 0;

  const live = (id: number) => {
    const pointer = pointers.get(id);
    return pointer?.end === undefined ? pointer : undefined;
  };

  const placed = (pointer: Pointer<Target>, x: number, y: number) => ({
    ...pointer,
    x,
    y,
    dx: x - pointer.start.x,
    dy: y - pointer.start.y,
  });

  const replace = (pointer: Pointer<Target>) => {
    const next = new Map(pointers);
    next.set(pointer.id, pointer);
    pointers = next;
    return pointer;
  };

  return {
    /** Every finger of the Gesture under way; empty between Gestures. */
    pointers: () => pointers,
    /** Whether some finger is down. */
    active: () => [...pointers.values()].some((p) => p.end === undefined),
    /** A finger landed: it joins the Gesture, or starts one. */
    down: (sample: PointerSample<Target>) => {
      if (pointers.has(sample.id)) return undefined;
      if (pointers.size === 0) zero = sample.t;
      return replace({
        id: sample.id,
        target: sample.target,
        start: { x: sample.x, y: sample.y, t: sample.t - zero },
        x: sample.x,
        y: sample.y,
        dx: 0,
        dy: 0,
      });
    },
    /** A finger moved. */
    move: (sample: PointerSample<Target>) => {
      const pointer = live(sample.id);
      if (pointer === undefined) return undefined;
      return replace(placed(pointer, sample.x, sample.y));
    },
    /** A finger lifted; it stays in the Gesture with its `end`. */
    up: (sample: PointerSample<Target>) => {
      const pointer = live(sample.id);
      if (pointer === undefined) return undefined;
      return replace({
        ...placed(pointer, sample.x, sample.y),
        end: { x: sample.x, y: sample.y, t: sample.t - zero },
      });
    },
    /** Every finger still down lifts where it is, at `t`. */
    lift: (t: number) => {
      for (const pointer of pointers.values()) {
        if (pointer.end !== undefined) continue;
        replace({
          ...pointer,
          end: { x: pointer.x, y: pointer.y, t: t - zero },
        });
      }
    },
    /** The Gesture is over: the next landing starts a new one. */
    clear: () => {
      pointers = new Map();
    },
  };
};
