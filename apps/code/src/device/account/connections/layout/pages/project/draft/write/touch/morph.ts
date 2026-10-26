import { useLayoutEffect, useRef, type RefObject } from 'react';

/*
 * The card's morph between one line and open: its height eased from what
 * it was to what it now is, its contents clipped as it goes, and its top
 * line faded up as it opens. Only by `animate`, on the element, so React
 * draws nothing for it. Not where `smooth` says no, as when it opens
 * straight to editing: there the keyboard's slide wants the card at its
 * size at once. Not under reduced motion.
 */

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const OPEN = 320;
const CLOSE = 260;

export function useMorph(
  card: RefObject<HTMLElement | null>,
  expanded: boolean,
  smooth: boolean,
) {
  // Its height as last drawn at rest, kept as it grows or shrinks by text.
  const height = useRef<number | null>(null);
  const morphing = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const element = card.current;
    if (element === null) return;
    const sizes = new ResizeObserver(() => {
      if (morphing.current === null) height.current = element.offsetHeight;
    });
    sizes.observe(element);
    return () => sizes.disconnect();
  }, [card]);

  useLayoutEffect(() => {
    const element = card.current;
    if (element === null) return;
    // From the height drawn, part way through a morph if one is under
    // way: that one stops first, whatever this one does, so its end is
    // never this one's, nor does it go on shrinking an open card.
    const under = morphing.current;
    const from =
      under === null ? height.current : element.getBoundingClientRect().height;
    under?.cancel();
    const to = element.offsetHeight;
    height.current = to;
    const reduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
    if (from === null || from === to || !smooth || reduced) return;
    if (typeof element.animate !== 'function') return;
    const duration = expanded ? OPEN : CLOSE;
    const morph = element.animate(
      [
        { height: `${from}px`, overflow: 'hidden' },
        { height: `${to}px`, overflow: 'hidden' },
      ],
      { duration, easing: EASE },
    );
    morphing.current = morph;
    const settle = () => {
      if (morphing.current === morph) morphing.current = null;
    };
    morph.onfinish = settle;
    morph.oncancel = settle;
    // Opening, its top line rises in a little after the card starts.
    const head = element.querySelector<HTMLElement>('[data-head]');
    if (expanded && head !== null)
      head.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: duration - 60, delay: 60, easing: EASE, fill: 'backwards' },
      );
  }, [expanded]);
}
