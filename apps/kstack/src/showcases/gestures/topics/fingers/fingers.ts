import { HandIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { Count } from './count.tsx';
import count from './count.tsx?raw';
import { Interrupted } from './interrupted.tsx';
import interrupted from './interrupted.tsx?raw';
import { Viewer } from './viewer.tsx';
import viewer from './viewer.tsx?raw';

/** Raw useGesture: every finger of a Gesture, and how it ends. */
export const fingers: Topic = {
  slug: 'fingers',
  title: 'Fingers',
  icon: HandIcon,
  scenarios: [
    {
      slug: 'viewer',
      sentence: 'Every finger, live. Drag one, add more, lift some.',
      Demo: Viewer,
      source: viewer,
      file: 'viewer.tsx',
    },
    {
      slug: 'count',
      sentence:
        'Fingers in landing order. Put down several, lift a few, then the rest.',
      Demo: Count,
      source: count,
      file: 'count.tsx',
      touchOnly: true,
    },
    {
      slug: 'interrupted',
      sentence:
        'A list that scrolls. Drag it, then hold a finger down and switch apps.',
      Demo: Interrupted,
      source: interrupted,
      file: 'interrupted.tsx',
    },
  ],
};
