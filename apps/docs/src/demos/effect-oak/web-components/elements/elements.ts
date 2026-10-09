import { defineColorPicker } from './color-picker.js';
import { definePixelBadge } from './pixel-badge.js';

/*
 * The two custom elements, written by hand with no library, and their types
 * for JSX. React 19 sets a custom element's known properties as properties
 * (so `color` reaches the setter, not an attribute), and a prop named
 * `on` + an event's name listens to that event: `oncolor-changed`.
 *
 * They are defined when this module loads in a browser, before any View
 * draws them, so React finds the properties already there.
 */

type ColorChanged = CustomEvent<{ readonly value: string }>;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'oak-color-picker': {
        readonly id?: string;
        readonly color: string;
        readonly 'oncolor-changed': (event: ColorChanged) => void;
      };
      'oak-pixel-badge': {
        readonly value: string;
        readonly fill: string;
        readonly background: string;
        readonly size: number;
      };
    }
  }
}

if (typeof window !== 'undefined') {
  defineColorPicker('oak-color-picker');
  definePixelBadge('oak-pixel-badge');
}

/** The new color a `color-changed` event carries. */
export const colorOf = (event: Event) => (event as ColorChanged).detail.value;
