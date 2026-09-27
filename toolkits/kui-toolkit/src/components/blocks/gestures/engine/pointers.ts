import type { Sample, Track } from './types';
import { createVelocityTracker } from './velocity';

type Position = { readonly id: number } & Sample;

const at = (input: Position): Sample => ({
  x: input.x,
  y: input.y,
  t: input.t,
});

/**
 * The pointers currently down, in the order they went down, and each one's
 * velocity. A lifted pointer's velocity is kept until the next touch starts,
 * so a pan ended by its own finger lifting can still read it.
 */
export const createPointerTracker = () => {
  const tracks = new Map<number, Track>();
  const velocities = new Map<
    number,
    ReturnType<typeof createVelocityTracker>
  >();

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
    velocities.get(input.id)?.add(current);
    return next;
  };

  return {
    size: () => tracks.size,
    has: (id: number) => tracks.has(id),
    get: (id: number) => tracks.get(id),
    list: (): ReadonlyArray<Track> => [...tracks.values()],
    down: (input: Position): Track => {
      if (tracks.size === 0) velocities.clear();
      const sample = at(input);
      const track: Track = {
        id: input.id,
        down: sample,
        current: sample,
        travel: 0,
      };
      tracks.set(input.id, track);
      const velocity = createVelocityTracker();
      velocity.add(sample);
      velocities.set(input.id, velocity);
      return track;
    },
    move,
    /** Moves the pointer to where it lifted, then forgets it. */
    up: (input: Position): Track | undefined => {
      const track = move(input);
      tracks.delete(input.id);
      return track;
    },
    /** Pointer `id`'s velocity at `t`, in px/ms. */
    velocity: (id: number, t: number) =>
      velocities.get(id)?.at(t) ?? { x: 0, y: 0 },
  };
};

export type PointerTracker = ReturnType<typeof createPointerTracker>;
