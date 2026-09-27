import {
  ANDROID_EDGE_STRIP_PX,
  EDGE_STRIP_PX,
  type Environment,
} from '../gestures';

/**
 * How the mobile sidebar may be swiped. `edge-swipe` opens from a touch that
 * starts at the left edge; `inner-swipe` from one that starts well clear of
 * both edges. `swipe` closes by dragging the open sidebar back to the left.
 */
export type SidebarGestures = {
  readonly open: 'none' | 'edge-swipe' | 'inner-swipe';
  readonly close: 'none' | 'swipe';
};

const NO_GESTURES: SidebarGestures = { open: 'none', close: 'none' };

/**
 * Which sidebar gestures this Environment allows. Only installed apps swipe:
 * a browser tab leaves its edges to the browser, so the menu button is the
 * way in; a desktop or wide viewport keeps the sidebar on screen. Installed on
 * iOS, the app owns the left edge and opens from it. Installed on Android, the
 * OS owns both edges for back, so opening starts inside them.
 */
export const sidebarGestures = (environment: Environment): SidebarGestures => {
  if (environment.platform === 'desktop' || environment.viewport === 'wide') {
    return NO_GESTURES;
  }
  if (environment.display === 'tab') return NO_GESTURES;
  return environment.platform === 'ios'
    ? { open: 'edge-swipe', close: 'swipe' }
    : { open: 'inner-swipe', close: 'swipe' };
};

/**
 * Whether a touch starting at `x` may begin an opening swipe: an edge swipe
 * inside the left edge strip, which the app owns when installed on iOS; an
 * inner swipe inside the Gesture Zone, clear of Android's back strips.
 */
export const opensFrom = (
  open: SidebarGestures['open'],
  x: number,
  viewportWidth: number,
): boolean => {
  switch (open) {
    case 'none':
      return false;
    case 'edge-swipe':
      return x >= 0 && x <= EDGE_STRIP_PX;
    case 'inner-swipe':
      return (
        x >= ANDROID_EDGE_STRIP_PX && x <= viewportWidth - ANDROID_EDGE_STRIP_PX
      );
  }
};
