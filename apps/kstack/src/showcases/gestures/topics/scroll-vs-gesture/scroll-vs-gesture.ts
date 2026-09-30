import { ArrowDownUpIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { AtTop } from './at-top.tsx';
import atTop from './at-top.tsx?raw';
import { CarouselInSwipe } from './carousel-in-swipe.tsx';
import carouselInSwipe from './carousel-in-swipe.tsx?raw';
import { EndMidDrag } from './end-mid-drag.tsx';
import endMidDrag from './end-mid-drag.tsx?raw';
import { Forced } from './forced.tsx';
import forced from './forced.tsx?raw';
import { TwoFingers } from './two-fingers.tsx';
import twoFingers from './two-fingers.tsx?raw';
import { VerticalList } from './vertical-list.tsx';
import verticalList from './vertical-list.tsx?raw';

/** Native Scroll: when the browser scrolls, and when a zone that wants the touch takes it. */
export const scrollVsGesture: Topic = {
  slug: 'scroll-vs-gesture',
  title: 'Scroll vs gesture',
  icon: ArrowDownUpIcon,
  scenarios: [
    {
      slug: 'vertical-list',
      sentence:
        'A list in a zone that listens for sideways Swipes. Drag up and down, then sideways.',
      Demo: VerticalList,
      source: verticalList,
      file: 'vertical-list.tsx',
    },
    {
      slug: 'at-top',
      sentence:
        'A list already at its top. Drag it down, then scroll and drag down.',
      Demo: AtTop,
      source: atTop,
      file: 'at-top.tsx',
    },
    {
      slug: 'end-mid-drag',
      sentence:
        'A short list that pulls up at its end. Scroll into the end mid-drag, then drag again.',
      Demo: EndMidDrag,
      source: endMidDrag,
      file: 'end-mid-drag.tsx',
    },
    {
      slug: 'two-fingers',
      sentence: 'A list that scrolls. Drag it with one finger, then with two.',
      Demo: TwoFingers,
      source: twoFingers,
      file: 'two-fingers.tsx',
      touchOnly: true,
    },
    {
      slug: 'carousel-in-swipe',
      sentence:
        'A carousel in a zone that listens for sideways Swipes. Swipe it through to its end, and past.',
      Demo: CarouselInSwipe,
      source: carouselInSwipe,
      file: 'carousel-in-swipe.tsx',
    },
    {
      slug: 'forced',
      sentence:
        'A list with a band that turns the zone on. Drag the band, then a row.',
      Demo: Forced,
      source: forced,
      file: 'forced.tsx',
    },
  ],
};
