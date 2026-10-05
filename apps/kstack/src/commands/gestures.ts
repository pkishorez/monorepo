import type { Way } from '../kit/thumb-lock/index.ts';
import type { ActionId } from './keys.ts';

/**
 * The Command each way of a Thumb Lock gives, in every Place: down to The
 * List, up to Add, and sideways through what the Place shows, as a page
 * turns. A Place without a Handler for one leaves that arm dimmed.
 */
export const THUMB: Readonly<Record<Way, ActionId>> = {
  down: 'jump',
  up: 'addEntry',
  left: 'next',
  right: 'previous',
};

/** How each Command is given on a touch screen, where it has a gesture. */
export const GESTURES: Partial<Readonly<Record<ActionId, string>>> = {
  jump: 'Thumb Lock, swipe down',
  addEntry: 'Thumb Lock, swipe up — or +',
  next: 'Thumb Lock, swipe left',
  previous: 'Thumb Lock, swipe right',
  toggleSidebar: 'Swipe right',
  'entries.open': 'Tap the row',
  'entries.entry.back': 'Thumb Lock, swipe down',
  'months.open': 'Tap the month',
  'months.month.back': 'Thumb Lock, swipe down',
  'add.cancel': 'Drag the sheet down',
};

/**
 * How a gesture moves: a Thumb Lock (the left thumb still, another finger
 * swiping), one finger swiping, a sheet dragged, or a tap.
 */
export type Motion =
  | { readonly kind: 'thumb'; readonly way: Way }
  | { readonly kind: 'swipe'; readonly way: Way }
  | { readonly kind: 'drag'; readonly way: Way }
  | { readonly kind: 'tap' };

/** One gesture of a Place, and what it does there. */
export type Gesture = { readonly does: string; readonly motion: Motion };

/** The gestures of a Place, and of the Places inside it. */
export type GestureGroup = {
  readonly title: string;
  readonly gestures: ReadonlyArray<Gesture>;
  readonly inside?: ReadonlyArray<GestureGroup>;
};

/**
 * Every gesture of Ledger, Place by Place, as Settings shows them. Each
 * runs the same Action as a key, so it works exactly where the key does.
 */
export const GESTURE_GUIDE: ReadonlyArray<GestureGroup> = [
  {
    title: 'Everywhere',
    gestures: [
      { does: 'Add an entry', motion: { kind: 'thumb', way: 'up' } },
      { does: 'Add an entry', motion: { kind: 'tap' } },
      { does: 'Open the sidebar', motion: { kind: 'swipe', way: 'right' } },
      { does: 'Close the sidebar', motion: { kind: 'swipe', way: 'left' } },
    ],
  },
  {
    title: 'Home',
    gestures: [
      { does: 'Jump to the entries', motion: { kind: 'thumb', way: 'down' } },
    ],
  },
  {
    title: 'Entries',
    gestures: [
      { does: 'Open the entry', motion: { kind: 'tap' } },
      { does: 'Next entry', motion: { kind: 'thumb', way: 'left' } },
      { does: 'Previous entry', motion: { kind: 'thumb', way: 'right' } },
    ],
    inside: [
      {
        title: 'An entry',
        gestures: [
          { does: 'Back to the list', motion: { kind: 'thumb', way: 'down' } },
          { does: 'Next entry', motion: { kind: 'thumb', way: 'left' } },
          { does: 'Previous entry', motion: { kind: 'thumb', way: 'right' } },
        ],
      },
    ],
  },
  {
    title: 'Months',
    gestures: [
      { does: 'Open the month', motion: { kind: 'tap' } },
      { does: 'Next in the list', motion: { kind: 'thumb', way: 'left' } },
      { does: 'Previous in the list', motion: { kind: 'thumb', way: 'right' } },
    ],
    inside: [
      {
        title: 'A month',
        gestures: [
          {
            does: 'Back to the months',
            motion: { kind: 'thumb', way: 'down' },
          },
          { does: 'Later month', motion: { kind: 'thumb', way: 'left' } },
          { does: 'Earlier month', motion: { kind: 'thumb', way: 'right' } },
        ],
      },
    ],
  },
  {
    title: 'Add',
    gestures: [
      { does: 'Close without saving', motion: { kind: 'drag', way: 'down' } },
    ],
  },
];
