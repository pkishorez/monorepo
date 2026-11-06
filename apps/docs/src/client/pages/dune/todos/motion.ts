import { useReducedMotion, type Transition } from 'motion/react';

/*
 * The to-dos' motion, in one place: its curves and timings, and what every
 * animated element inside the canvas needs.
 *
 * Active sits left of Completed, and whatever moves between them travels
 * that way: completing swipes a row right, making it active swipes it
 * left, and a tab's rows come in from its side.
 */

/** Entering: a strong ease-out, quick to respond, settling in. */
export const ENTER = [0.23, 1, 0.32, 1] as const;
/** Something already on screen moving: accelerate, then brake. */
export const MOVE = [0.77, 0, 0.175, 1] as const;
/**
 * Rows gliding into the place another left. A spring with no bounce: it
 * starts at once, where a curve that eases in lags the swipe that caused
 * it, and keeps its speed if the list changes again mid-glide.
 */
export const GLIDE = { type: 'spring', duration: 0.3, bounce: 0 } as const;

/** Enters take this long; exits about a quarter less. */
export const ENTER_S = 0.24;
export const EXIT_S = 0.18;
/** Between one row and the next as a list comes in, and the most rows staggered. */
export const STAGGER_S = 0.035;
export const STAGGER_MAX = 8;
/** How far a row travels sideways, in px: a nudge, not a slide across. */
export const TRAVEL = 40;

/**
 * Spread on a Motion element inside an <HtmlCanvas>. Motion hands opacity,
 * transforms and filters to the compositor, which the canvas's snapshot
 * never sees: the fade would show only as a jump at its end. Listening to
 * every frame keeps the animation on the main thread, where each frame is
 * painted, so the canvas draws all of it.
 */
export const DRAWN = { onUpdate: () => {} } as const;

const INSTANT: Transition = { duration: 0 };

/** Transitions as given, or instant when the user asks for less motion. */
export const useTransition = () => {
  const still = useReducedMotion();
  return (transition: Transition): Transition => (still ? INSTANT : transition);
};
