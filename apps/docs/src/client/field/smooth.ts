import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

/*
 * The page's own scroll, made to glide while a field is on it. A mouse
 * wheel moves a page in steps of a hundred pixels or so; the words would
 * jump with each step while the shapes ease behind, and the two would come
 * apart. Here the wheel's steps are eased into one glide, so the words, the
 * scroll-driven fades and the field all move together.
 *
 * Touch and trackpads keep their own momentum, which is already smooth and
 * feels wrong when copied. A box that scrolls on its own (search results,
 * a menu) scrolls natively, the page holds still while a dialog locks it,
 * and a reader who asked for less motion keeps the browser's scroll.
 */

export function smoothScroll(): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return () => {};
  const lenis = new Lenis({
    autoRaf: true,
    lerp: 0.12,
    smoothWheel: true,
    syncTouch: false,
    allowNestedScroll: true,
    autoToggle: true,
    anchors: true,
    stopInertiaOnNavigate: true,
  });
  return () => lenis.destroy();
}
