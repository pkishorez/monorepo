import { useCallback } from 'react';
import type { HTMLAttributes } from 'react';

/** How data that took the place of a loading screen comes in. */
const FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const TIMING: KeyframeAnimationOptions = { duration: 150, easing: 'ease-out' };

export type FadeInProps = HTMLAttributes<HTMLDivElement> & {
  /** Whether it fades in: a Ready status's `waited`. */
  readonly when: boolean;
};

/**
 * A `<div>` that fades in over 150 ms as it is drawn, when `when` says so:
 * for a page's data that took the place of its loading screen,
 * `<Router.FadeIn when={status.waited}>`. Data shown at once, or loaded
 * behind data shown, comes in as it is. Purely visual: nothing waits on it,
 * and it stays still for a visitor who asks for reduced motion.
 */
export function FadeIn({ when, ...rest }: FadeInProps) {
  const fade = useCallback(
    (element: HTMLDivElement | null) => {
      if (!when || !element || typeof element.animate !== 'function') return;
      if (
        typeof matchMedia === 'function' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        return;
      const animation = element.animate(FADE, TIMING);
      return () => animation.cancel();
    },
    [when],
  );
  return <div {...rest} ref={fade} />;
}
