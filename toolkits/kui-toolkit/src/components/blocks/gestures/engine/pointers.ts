import type { Sample, Track } from '../recognizers';

type Position = { readonly id: number } & Sample;

const at = (input: Position): Sample => ({
  x: input.x,
  y: input.y,
  t: input.t,
});

/** The pointers currently down, in the order they went down. */
export const createPointerTracker = () => {
  const tracks = new Map<number, Track>();

  const move = (input: Position): Track | undefined => {
    const previous = tracks.get(input.id);
    if (previous === undefined) return undefined;
    const current = at(input);
    const next: Track = {
      ...previous,
      current,
      travel: Math.max(
        previous.travel,
        Math.hypot(current.x - previous.down.x, current.y - previous.down.y),
      ),
    };
    tracks.set(input.id, next);
    return next;
  };

  return {
    size: () => tracks.size,
    has: (id: number) => tracks.has(id),
    list: (): ReadonlyArray<Track> => [...tracks.values()],
    down: (input: Position): Track => {
      const sample = at(input);
      const track: Track = {
        id: input.id,
        down: sample,
        current: sample,
        travel: 0,
      };
      tracks.set(input.id, track);
      return track;
    },
    move,
    /** Moves the pointer to where it lifted, then forgets it. */
    up: (input: Position): Track | undefined => {
      const track = move(input);
      tracks.delete(input.id);
      return track;
    },
    clear: () => tracks.clear(),
  };
};
