import { ZoomInIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { PanWhenZoomed } from './pan-when-zoomed.tsx';
import panWhenZoomed from './pan-when-zoomed.tsx?raw';
import { PinchInList } from './pinch-in-list.tsx';
import pinchInList from './pinch-in-list.tsx?raw';
import { Zoom } from './zoom.tsx';
import zoom from './zoom.tsx?raw';

/** Two fingers that zoom, read from raw Pointers. */
export const pinch: Topic = {
  slug: 'pinch',
  title: 'Pinch',
  icon: ZoomInIcon,
  scenarios: [
    {
      slug: 'zoom',
      sentence:
        'A photo. Pinch it open around any point, then past 4× or below 1×, and let go.',
      Demo: Zoom,
      source: zoom,
      file: 'zoom.tsx',
      touchOnly: true,
    },
    {
      slug: 'pan-when-zoomed',
      sentence: 'Drag the photo with one finger, then zoom it and drag again.',
      Demo: PanWhenZoomed,
      source: panWhenZoomed,
      file: 'pan-when-zoomed.tsx',
      touchOnly: true,
    },
    {
      slug: 'pinch-in-list',
      sentence:
        'A photo in a feed. Scroll with one finger on it, then pinch it with two.',
      Demo: PinchInList,
      source: pinchInList,
      file: 'pinch-in-list.tsx',
      touchOnly: true,
    },
  ],
};
