import { CircleSlashIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { ButtonInSwipe } from './button-in-swipe.tsx';
import buttonInSwipe from './button-in-swipe.tsx?raw';
import { Controls } from './controls.tsx';
import controls from './controls.tsx?raw';
import { ScreenEdges } from './screen-edges.tsx';
import screenEdges from './screen-edges.tsx?raw';

/** What a zone leaves alone: controls, clicks, and the browser at the edges. */
export const optingOut: Topic = {
  slug: 'opting-out',
  title: 'Opting out',
  icon: CircleSlashIcon,
  scenarios: [
    {
      slug: 'controls',
      sentence:
        'A text field, a slider and a pad in a zone that Swipes. Use each, then swipe between them.',
      Demo: Controls,
      source: controls,
      file: 'controls.tsx',
    },
    {
      slug: 'button-in-swipe',
      sentence:
        'A button on a card that Swipes. Tap it, then swipe starting on it.',
      Demo: ButtonInSwipe,
      source: buttonInSwipe,
      file: 'button-in-swipe.tsx',
    },
    {
      slug: 'screen-edges',
      sentence:
        'The whole screen is a zone. Swipe in from a side edge, then tap the buttons there.',
      Demo: ScreenEdges,
      source: screenEdges,
      file: 'screen-edges.tsx',
      fullScreen: true,
    },
  ],
};
