import type { Environment } from './environment';

/** Width of the strip along each side edge that is left to the browser or OS. */
export const EDGE_STRIP_PX = 24;

/**
 * Android's system back gesture owns a strip along both edges whose width the
 * user can widen, so the strip there stays clear of the default with room to spare.
 */
export const ANDROID_EDGE_STRIP_PX = 32;

/** Who acts on a swipe that starts in an edge strip. */
export type EdgeOwner = 'browser' | 'os' | 'app';

export type EdgeStrip = { readonly owner: EdgeOwner; readonly width: number };

export type EdgeStrips = {
  readonly left: EdgeStrip;
  readonly right: EdgeStrip;
};

const strips = (owner: EdgeOwner, width: number): EdgeStrips => ({
  left: { owner, width },
  right: { owner, width },
});

/**
 * Who owns each side edge in this Environment. In a browser tab the browser
 * swipes back and forward from them; on Android the OS swipes back from both,
 * tab or installed. An installed iOS app has no system edge swipe, so the
 * edges are the app's: a Gesture Zone listens in them only for edge swipes,
 * such as a sidebar pulled in from the left.
 */
export const edgeStrips = (environment: Environment): EdgeStrips => {
  switch (environment.platform) {
    case 'android':
      return strips('os', ANDROID_EDGE_STRIP_PX);
    case 'ios':
      return strips(
        environment.display === 'installed' ? 'app' : 'browser',
        EDGE_STRIP_PX,
      );
    case 'desktop':
      return strips('browser', EDGE_STRIP_PX);
  }
};
