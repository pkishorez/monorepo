import { ImagesIcon } from '@kstackz/ui-toolkit/lucide';
import { codeFiles, type Feature } from '../feature.ts';
import { App } from './app.tsx';

/** A phone photo library: a pinchable grid, a zoomable viewer, and albums in a sidebar. */
export const photos: Feature = {
  slug: 'photos',
  title: 'Photos',
  icon: ImagesIcon,
  tries: [
    'Pinch the grid in with two fingers: it goes from 3 to 5 columns, the photo under your fingers stays put.',
    'Start scrolling the grid, then add a second finger: the scroll keeps the touch, nothing pinches.',
    'Swipe right anywhere on the grid: the albums open; swipe left to put them away.',
    'Open a photo, then swipe right on it: it goes to the previous photo, never the albums.',
    'Pinch or double-tap a photo to zoom, then drag sideways: it pans first and only moves to the next photo once you hit its edge.',
    'Zoom in, then swipe down: it pans; at 1x the same swipe shrinks the photo back into its tile.',
    'Swipe down a little and let go slowly: the photo springs back and the background returns.',
    'Swipe to another photo, then swipe down: it closes onto that photo’s tile, scrolled into view.',
    'Swipe a photo down and scroll the grid at once: the photo rides along with its tile and slides under the header.',
  ],
  App,
  files: codeFiles(
    'photos',
    import.meta.glob('./*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ),
};
