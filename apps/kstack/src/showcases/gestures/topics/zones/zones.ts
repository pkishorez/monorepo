import { LayersIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { Nested } from './nested.tsx';
import nested from './nested.tsx?raw';
import { ShowcaseSidebar } from './showcase-sidebar.tsx';
import showcaseSidebar from './showcase-sidebar.tsx?raw';
import { Siblings } from './siblings.tsx';
import siblings from './siblings.tsx?raw';
import { Trapped } from './trapped.tsx';
import trapped from './trapped.tsx?raw';
import { TrappedWhileOpen } from './trapped-while-open.tsx';
import trappedWhileOpen from './trapped-while-open.tsx?raw';

/** Who hears a touch: zones that nest, sit side by side, and trap. */
export const zones: Topic = {
  slug: 'zones',
  title: 'Zones',
  icon: LayersIcon,
  scenarios: [
    {
      slug: 'nested',
      sentence: 'A zone inside a zone. Touch the inner one, then the outer.',
      Demo: Nested,
      source: nested,
      file: 'nested.tsx',
    },
    {
      slug: 'siblings',
      sentence: 'Two zones side by side. Touch one; the other never hears it.',
      Demo: Siblings,
      source: siblings,
      file: 'siblings.tsx',
    },
    {
      slug: 'trapped',
      sentence:
        'A zone inside a zone. Touch the inner one, trap it, and touch again.',
      Demo: Trapped,
      source: trapped,
      file: 'trapped.tsx',
    },
    {
      slug: 'trapped-while-open',
      sentence:
        'Rows trapped only while open. Swipe a row right, then open one and swipe it right.',
      Demo: TrappedWhileOpen,
      source: trappedWhileOpen,
      file: 'trapped-while-open.tsx',
    },
    {
      slug: 'showcase-sidebar',
      sentence:
        "This card is trapped, so the Showcase's own sidebar never opens from here. Swipe right here, then from the screen edge.",
      Demo: ShowcaseSidebar,
      source: showcaseSidebar,
      file: 'showcase-sidebar.tsx',
    },
  ],
};
