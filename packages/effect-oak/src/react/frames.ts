import { createContext, useContext, useLayoutEffect, useRef } from 'react';

/*
 * Frames: the moments a View is drawn at, between Messages. React renders
 * only when a Message changes an Instance; a Frame moves what is already
 * drawn, through refs, with no render.
 *
 * Live, every animation frame is a Frame at the Runtime's Time now. During
 * Time Travel, every move of the timeline is one Frame at that Time.
 */

/** Where a View's Frames come from. */
export interface Frames {
  /** The Time Views are drawn at right now. */
  readonly now: () => number;
  /** Call `draw` at every Frame until unsubscribed. */
  readonly subscribe: (draw: (at: number) => void) => () => void;
}

/** Outside a running app nothing moves: every Frame is at Time 0. */
const still: Frames = { now: () => 0, subscribe: () => () => {} };

export const FramesContext = createContext<Frames>(still);

/**
 * Draw at every Frame: `draw` gets the Time and moves elements through refs.
 * It also runs after every render, before paint, so a new Model never shows
 * for a moment at an old position.
 */
export type UseFrame = (draw: (at: number) => void) => void;

export const useFrame: UseFrame = (draw) => {
  const frames = useContext(FramesContext);
  const latest = useRef(draw);
  useLayoutEffect(() => {
    latest.current = draw;
    draw(frames.now());
  });
  useLayoutEffect(() => frames.subscribe((at) => latest.current(at)), [frames]);
};
