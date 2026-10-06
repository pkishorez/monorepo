/** One loaded player of one sound. */
export interface Voice {
  /** Starts the sound from its beginning, cutting off what it was playing. */
  restart(): void;
  release(): void;
}

/**
 * Several Voices of each sound, loaded up front and taken in turn, so a
 * sound played again while it still rings starts at once on the next Voice
 * instead of waiting for a player to load or cutting itself off.
 */
export function makePool<Name extends string>(
  names: ReadonlyArray<Name>,
  voices: number,
  load: (name: Name) => Voice,
) {
  const lanes = new Map(
    names.map((name) => [
      name,
      { next: 0, voices: Array.from({ length: voices }, () => load(name)) },
    ]),
  );

  return {
    play(name: Name): void {
      const lane = lanes.get(name);
      if (!lane) return;
      lane.voices[lane.next]?.restart();
      lane.next = (lane.next + 1) % lane.voices.length;
    },
    release(): void {
      for (const lane of lanes.values()) {
        for (const voice of lane.voices) voice.release();
      }
      lanes.clear();
    },
  };
}
