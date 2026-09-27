import type { Tutorial } from '../tutorial/index.ts';
import code from './gestures.tsx?raw';

export const matrixTutorial: Tutorial = {
  title: 'Matrix',
  summary:
    'Every gesture the engine reads, with no Hold, a left Hold and a right Hold. Each cell counts what it recognised.',
  tryThis: [
    {
      gesture: 'Tap, or double tap',
      result:
        'The first row counts a tap; two quick taps count in the second row instead, never both.',
    },
    {
      gesture: 'Drag one finger',
      result:
        'Pan mode shows the offset; Swipe mode shows the direction and how far, and counts past 40% or on a flick.',
    },
    {
      gesture: 'Two fingers: tap, double tap, drag',
      result: 'The same three, with two fingers together.',
    },
    {
      gesture: 'Pinch',
      result: 'Shows the scale, springs back past 4× or ¼×.',
    },
    {
      gesture: 'Keep one finger still, then do any of these with the others',
      result:
        'After a 50ms lead, the still finger becomes the Hold. Its column is left or right of the other fingers, and its chip remains visible without dimming the matrix.',
    },
    {
      gesture: 'Flip the Pan / Swipe switch',
      result:
        'The movement rows change from Pan to Swipe, so each cell shows one kind at a time.',
    },
  ],
  howItWorks: [
    'The matrix is its own GestureZone with scroll="none", inside the lab\'s root zone, so every touch here is the matrix\'s.',
    "Each cell calls one hook: useTap, usePan, useSwipe or usePinch, with its row's fingers and its column's hold.",
    'Nothing is decided when fingers land. The first movement past 10px classifies the gesture. A still finger needs a 50ms lead to become the Hold; fingers landing closer together remain a multi-finger gesture.',
    'Double taps are registered for every combination here, so single taps wait 300ms for a second one. On a screen with no double tap, a tap fires the moment you lift.',
    'A Pan and a Swipe may share fingers and Hold: the Swipe claims its directions and the Pan gets the rest. With Swipes in all four directions a Pan would get nothing, so the switch mounts one set or the other.',
  ],
  code,
  animation: [
    'The hooks write motion values on every move: no React render while a finger is down.',
    'Each live value is a useTransform of those values into text, rendered straight into the cell.',
    'When a gesture is recognised the cell counts it, and its glow fades over 180ms with a restrained ease-out. Reduced-motion mode updates it immediately.',
    "Swipe progress settles to 1 on commit or back to 0 with the finger's velocity. A synchronous action can be swiped again immediately, even while the previous return is still moving; only an action that returns a promise locks its own driver until that work ends.",
    'Pinch springs back inside its limits.',
  ],
};
