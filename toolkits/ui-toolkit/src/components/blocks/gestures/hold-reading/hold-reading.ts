/** A Hold Zone: the bottom-left or bottom-right corner of the Gesture Zone. */
export type Side = 'left' | 'right';

/** Which Hold a Gesture is under: `none` when no Hold is on. */
export type Hold = 'none' | Side;

/**
 * What a finger landing is: one of the Gesture's, one set aside, or one of
 * the Gesture's whose landing just started a Hold from the corner finger.
 */
export type Landing = 'finger' | 'aside' | 'held';

/** A finger's position in viewport px at time `t` in ms. */
export type HoldSample = {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly t: number;
};

// How long the corner finger must have been down before another lands for
// it to become the Hold. Fingers landing closer together are a pinch.
export const HOLD_LEAD_MS = 150;

// How far the corner finger may drift and still be still.
const STILL_PX = 8;

type Candidate = HoldSample & { readonly side: Side };

/**
 * Reads the Hold from the fingers on the zone. The first finger landing in a
 * Hold Zone is only a candidate, and an ordinary finger meanwhile. It becomes
 * that Hold when another finger lands at least HOLD_LEAD_MS later while it is
 * still; lifting or moving first, or another finger landing sooner, leaves it
 * ordinary. A Hold stays on until no finger is left, even when the Hold
 * finger itself lifts. While it is on, a finger landing in either Hold Zone
 * is set aside and does nothing; every other finger makes the Gesture under
 * the Hold.
 */
export const createHoldReading = () => {
  const down = new Set<number>();
  const aside = new Set<number>();
  let hold: Hold = 'none';
  let candidate: Candidate | undefined;

  return {
    hold: (): Hold => hold,
    /** A finger lands, in the Hold Zone on `corner`, or in none. */
    down: (finger: HoldSample, corner: Side | undefined): Landing => {
      const first = down.size === 0;
      down.add(finger.id);
      if (hold !== 'none') {
        if (corner === undefined) return 'finger';
        aside.add(finger.id);
        return 'aside';
      }
      if (first) {
        candidate =
          corner === undefined ? undefined : { ...finger, side: corner };
        return 'finger';
      }
      const waiting = candidate;
      candidate = undefined;
      if (waiting === undefined || finger.t - waiting.t < HOLD_LEAD_MS) {
        return 'finger';
      }
      hold = waiting.side;
      aside.add(waiting.id);
      return 'held';
    },
    /** A finger moves: the corner finger moving leaves it ordinary. */
    move: (finger: HoldSample) => {
      if (candidate?.id !== finger.id) return;
      const drift = Math.hypot(finger.x - candidate.x, finger.y - candidate.y);
      if (drift >= STILL_PX) candidate = undefined;
    },
    /**
     * A finger lifts: `finger` when it was one of the Gesture's, `released`
     * when it was the last and so ended the Hold.
     */
    up: (id: number) => {
      if (candidate?.id === id) candidate = undefined;
      const known = down.delete(id);
      const finger = known && !aside.delete(id);
      const released = down.size === 0 && hold !== 'none';
      if (released) hold = 'none';
      return { finger, released };
    },
    /** Every finger was taken away. */
    reset: () => {
      down.clear();
      aside.clear();
      candidate = undefined;
      hold = 'none';
    },
  };
};

export type HoldReading = ReturnType<typeof createHoldReading>;
