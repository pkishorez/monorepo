import { createContext, type ReactNode, useMemo } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The standard step transition: an ease-out (no-bounce) spring for
 * motion/layout, and a matching tween for paint properties (color, shadow) so
 * everything settles together at the configured duration.
 */
export function buildTransition(duration: number) {
  const move = { type: 'spring' as const, duration, bounce: 0 };
  const paint = { duration, ease: EASE };
  return {
    default: move,
    backgroundColor: paint,
    boxShadow: paint,
    color: paint,
  };
}

/** Carries the active scene's default transition down to every {@link Div}. */
export const TransitionContext = createContext(buildTransition(0.7));

/** Sets the default transition (by `duration` in seconds) for the subtree below. */
export function TransitionProvider({
  duration,
  children,
}: {
  duration: number;
  children: ReactNode;
}) {
  const value = useMemo(() => buildTransition(duration), [duration]);
  return <TransitionContext value={value}>{children}</TransitionContext>;
}
