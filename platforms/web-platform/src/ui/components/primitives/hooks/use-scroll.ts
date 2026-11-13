import { useRef, useState, useCallback, useEffect } from 'react';

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * How close to the bottom (px) the user must be for auto-scroll to
 * re-engage.  Generous enough that momentum-deceleration, content
 * streaming between frames, and sub-pixel rounding can't prevent it.
 */
const REENGAGE_THRESHOLD = 80;

function getEl(el?: HTMLElement | null): HTMLElement {
  return (
    el ??
    (document.scrollingElement as HTMLElement | null) ??
    document.documentElement
  );
}

function getRootEl(): HTMLElement {
  return (
    (document.scrollingElement as HTMLElement | null) ??
    document.documentElement
  );
}

function getScrollTop(el?: HTMLElement | null): number {
  return el ? el.scrollTop : window.scrollY;
}

function maxScroll(el?: HTMLElement | null): number {
  if (!el) {
    const rootEl = getRootEl();
    return rootEl.scrollHeight - rootEl.clientHeight;
  }
  return el.scrollHeight - el.clientHeight;
}

function nearBottom(el?: HTMLElement | null): boolean {
  return maxScroll(el) - getScrollTop(el) <= REENGAGE_THRESHOLD;
}

/**
 * Returns `true` on touch devices when an input-like element is focused.
 * Used to skip auto-scroll during virtual-keyboard resize events that
 * change the viewport but not the content.
 */
function hasVirtualKeyboardInput(): boolean {
  if (!window.matchMedia('(pointer: coarse)').matches) return false;
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    el.closest('[contenteditable]') != null
  );
}

// ─────────────────────────────────────────────────────────────────────────
// useScroll
//
// sticky=true  → pinned to bottom; content growth auto-tracked
// sticky=false → user is in control
//
// Four mechanisms:
//   1. Content tracking : ResizeObserver → snap when sticky,
//                         re-engage + snap when user is near bottom
//   2. Smooth scroll    : rAF + easeOutCubic (button click / API)
//   3. Re-engage        : scroll-down near bottom, wheel-down near bottom
//   4. Disengage        : wheel-up, touchmove
// ─────────────────────────────────────────────────────────────────────────

export function useScroll(element?: HTMLElement | null) {
  const isRoot = element == null;
  const stickyRef = useRef(true);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const rafIdRef = useRef<number | null>(null);

  // ── Internal helpers ──────────────────────────────────────────────────

  const cancelRaf = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const engage = useCallback(() => {
    stickyRef.current = true;
    setIsAutoScrolling(true);
  }, []);

  const disengage = useCallback(() => {
    stickyRef.current = false;
    setIsAutoScrolling(false);
    cancelRaf();
  }, [cancelRaf]);

  // ── rAF smooth scroll ────────────────────────────────────────────────

  const animateScrollTo = useCallback(
    (target: number) => {
      cancelRaf();
      const el = getEl(element);
      const start = isRoot ? getRootEl().scrollTop : el.scrollTop;
      const distance = target - start;
      if (Math.abs(distance) < 1) return;

      const duration = Math.min(300, Math.max(150, Math.abs(distance) * 0.5));
      const startTime = performance.now();

      const step = (now: number) => {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        const next = start + distance * eased;
        if (isRoot) {
          getRootEl().scrollTop = next;
        } else {
          el.scrollTop = next;
        }
        if (t < 1) {
          rafIdRef.current = requestAnimationFrame(step);
        } else {
          rafIdRef.current = null;
        }
      };

      rafIdRef.current = requestAnimationFrame(step);
    },
    [element, cancelRaf],
  );

  // ── ResizeObserver ────────────────────────────────────────────────────
  // When sticky → snap to bottom on any content growth.
  // When NOT sticky but user is near bottom → re-engage and snap.
  // This handles the streaming case where the user has parked near the
  // bottom but no more scroll events fire (scrollTop didn't change).

  useEffect(() => {
    const el = getEl(element);
    const scrollEl = isRoot ? undefined : el;
    const observeTarget = isRoot ? document.body : el;

    const snapToBottom = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (isRoot) {
        getRootEl().scrollTop = maxScroll();
      } else {
        el.scrollTop = maxScroll(el);
      }
    };

    // Initial snap
    if (stickyRef.current) snapToBottom();

    const observer = new ResizeObserver(() => {
      // On touch devices, skip all resize-driven snapping while an input
      // is focused.  Virtual keyboard open/close AND input-field growth
      // (typing more lines) both fire this observer and cause jarring
      // jumps on mobile.
      if (hasVirtualKeyboardInput()) return;

      if (stickyRef.current) {
        snapToBottom();
      } else if (nearBottom(scrollEl)) {
        engage();
        snapToBottom();
      }
    });

    observer.observe(observeTarget);
    return () => observer.disconnect();
  }, [element, engage]);

  // ── Scroll / wheel / touch — engage & disengage ──────────────────────
  //
  // Re-engage (any one is sufficient):
  //   • scroll event while scrolling DOWN and within REENGAGE_THRESHOLD
  //   • wheel event with deltaY > 0  and within REENGAGE_THRESHOLD
  //     (catches the edge where scrollTop === maxScroll → no scroll fires)
  //
  // Disengage:
  //   • wheel event with deltaY < 0  (user scrolling up)
  //   • touchmove event              (mobile drag)

  useEffect(() => {
    const scrollEl = isRoot ? undefined : getEl(element);
    const target = isRoot ? window : getEl(element);
    let lastScrollTop = getScrollTop(scrollEl);

    // ── scroll: fires when scrollTop actually changes ──
    const handleScroll = () => {
      const current = getScrollTop(scrollEl);
      const goingDown = current >= lastScrollTop;
      lastScrollTop = current;

      if (stickyRef.current) return;
      if (goingDown && nearBottom(scrollEl)) {
        engage();
      }
    };

    // ── wheel: fires even at edges where scrollTop can't move ──
    const handleWheel = (e: Event) => {
      const { deltaY } = e as WheelEvent;

      // Scrolling up → disengage (always, regardless of position).
      if (deltaY < 0 && stickyRef.current && maxScroll(scrollEl) > 0) {
        disengage();
        return;
      }

      // Scrolling down while disengaged → re-engage if near bottom.
      if (deltaY > 0 && !stickyRef.current && nearBottom(scrollEl)) {
        engage();
      }
    };

    // ── touch: any drag disengages (mobile) ──
    const handleTouchMove = () => {
      if (stickyRef.current) disengage();
    };

    target.addEventListener('scroll', handleScroll, { passive: true });
    target.addEventListener('wheel', handleWheel, { passive: true });
    target.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => {
      target.removeEventListener('scroll', handleScroll);
      target.removeEventListener('wheel', handleWheel);
      target.removeEventListener('touchmove', handleTouchMove);
    };
  }, [element, engage, disengage, isRoot]);

  // ── Public API ────────────────────────────────────────────────────────

  const scrollDownBy = useCallback(
    (px: number) => {
      const el = getEl(element);
      animateScrollTo(getScrollTop(isRoot ? undefined : el) + px);
    },
    [element, animateScrollTo, isRoot],
  );

  const scrollUpBy = useCallback(
    (px: number) => {
      const el = getEl(element);
      animateScrollTo(getScrollTop(isRoot ? undefined : el) - px);
    },
    [element, animateScrollTo, isRoot],
  );

  const scrollToTop = useCallback(() => {
    animateScrollTo(0);
  }, [animateScrollTo]);

  const scrollToEnd = useCallback(() => {
    animateScrollTo(maxScroll(isRoot ? undefined : getEl(element)));
  }, [element, animateScrollTo, isRoot]);

  /** Engage sticky mode and smooth-scroll to bottom. */
  const alwaysScrollToBottom = useCallback(() => {
    if (stickyRef.current) return;
    engage();
    animateScrollTo(maxScroll(isRoot ? undefined : getEl(element)));
  }, [element, engage, animateScrollTo, isRoot]);

  /** Disengage sticky mode. */
  const stopAlwaysScrollToBottom = useCallback(() => {
    disengage();
  }, [disengage]);

  // ── Cleanup ───────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  return {
    scrollDownBy,
    scrollUpBy,
    scrollToTop,
    scrollToEnd,
    alwaysScrollToBottom,
    stopAlwaysScrollToBottom,
    isAutoScrolling,
  };
}
