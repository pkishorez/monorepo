import type { Tutorial } from '../tutorial/index.ts';
import code from './gestures.ts?raw';

export const mapTutorial: Tutorial = {
  title: 'Map',
  summary:
    'A made-up town to pan and zoom, with a Hold on either side for pins and layers.',
  tryThis: [
    {
      gesture: 'Drag one finger',
      result: 'The map follows and coasts when you flick; touch it to stop it.',
    },
    {
      gesture: 'Pinch',
      result: 'Zooms around your fingers, and pans with them as they move.',
    },
    { gesture: 'Double tap', result: 'Zooms in a step at that point.' },
    {
      gesture: 'Tap with two fingers',
      result: 'Zooms out a step. Twice quickly fits the whole map.',
    },
    {
      gesture: 'Keep a finger still on the left, tap to its right',
      result: 'Drops a pin where you tapped. A chip says which Hold is down.',
    },
    {
      gesture: 'Keep a finger still on the right, swipe up or down to its left',
      result: 'Changes the ground layer: dots, grid, plain.',
    },
  ],
  howItWorks: [
    'The map is a GestureZone with scroll="none".',
    'One usePan moves x and y. usePinch gets the same x and y and its own scale, so zooming keeps the point under your fingers still.',
    'The taps are useTap with count and fingers: a one-finger double tap, a two-finger tap and a two-finger double tap. Because a two-finger double tap is registered, a two-finger tap waits 300ms to be sure it is not one.',
    'A Hold is a finger kept still while the others act. useTap({ hold: "left" }) only answers taps made with a left Hold; useSwipe({ hold: "right" }) only Swipes with a right Hold. useHold shows which one is down.',
    "The one-finger Pan wins over the lab's sidebar Swipe here: the innermost zone with a hook for a gesture gets it. Use the menu button to open the sidebar.",
  ],
  code,
  animation: [
    'x, y and scale are motion values on one element, transformed from its top left.',
    "Every move sets them directly. On release the Pan coasts with your finger's speed and bounces off its bounds; the Pinch springs back inside its limits.",
    'Taps call settle() on the same values, so zooming by tap uses the same spring as a release.',
    'Pins are counter-scaled with a useTransform of scale, so they stay the same size.',
  ],
};
