/** A Hold Zone: the bottom-left or bottom-right corner of the Gesture Zone. */
export type Side = 'left' | 'right';

/** Which Hold a Gesture is under: `none` when no Hold is on. */
export type Hold = 'none' | Side;

/** What a finger landing is: the Hold, one set aside, or one of the Gesture's. */
export type Landing = 'hold' | 'aside' | 'finger';

/**
 * Reads the Hold from the fingers on the zone. A finger landing in a Hold
 * Zone while no finger is on the zone starts that Hold; it stays on until no
 * finger is left, even when the Hold finger itself lifts. While it is on, a
 * finger landing in either Hold Zone is set aside and does nothing; every
 * other finger makes the Gesture under the Hold.
 */
export const createHoldReading = () => {
  const down = new Set<number>();
  const aside = new Set<number>();
  let hold: Hold = 'none';

  return {
    hold: (): Hold => hold,
    /** A finger lands, in the Hold Zone on `corner`, or in none. */
    down: (id: number, corner: Side | undefined): Landing => {
      const first = down.size === 0;
      down.add(id);
      if (corner === undefined) return 'finger';
      if (first) hold = corner;
      else if (hold === 'none') return 'finger';
      aside.add(id);
      return first ? 'hold' : 'aside';
    },
    /**
     * A finger lifts: `finger` when it was one of the Gesture's, `released`
     * when it was the last and so ended the Hold.
     */
    up: (id: number) => {
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
      hold = 'none';
    },
  };
};

export type HoldReading = ReturnType<typeof createHoldReading>;
