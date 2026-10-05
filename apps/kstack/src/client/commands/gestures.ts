import type { Way } from '../kit/thumb-lock/index.ts';
import type { ActionId } from './keys.ts';

// Every Go is a Thumb Lock Step, or a few, through the Place order.
const STEP = 'Thumb Lock, Step up or down to it';

/** How each Command is given on a touch screen, where it has a gesture. */
export const GESTURES: Partial<Readonly<Record<ActionId, string>>> = {
  toHome: STEP,
  toEntries: STEP,
  toMonths: STEP,
  toSettings: STEP,
  addEntry: 'Tap +',
  toggleSidebar: 'Swipe right',
  'entries.open': 'Tap the row',
  'entries.remove': 'Swipe the row left',
  'months.open': 'Tap the month',
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
      {
        does: 'Step to the place before',
        motion: { kind: 'thumb', way: 'up' },
      },
      {
        does: 'Step to the place after',
        motion: { kind: 'thumb', way: 'down' },
      },
      { does: 'Add an entry', motion: { kind: 'tap' } },
      { does: 'Open the sidebar', motion: { kind: 'swipe', way: 'right' } },
      { does: 'Close the sidebar', motion: { kind: 'swipe', way: 'left' } },
    ],
  },
  {
    title: 'Entries',
    gestures: [
      { does: 'Open the entry', motion: { kind: 'tap' } },
      { does: 'Delete the entry', motion: { kind: 'swipe', way: 'left' } },
    ],
    inside: [
      {
        title: 'An entry',
        gestures: [
          { does: 'Up to the entries', motion: { kind: 'thumb', way: 'up' } },
        ],
      },
    ],
  },
  {
    title: 'Months',
    gestures: [{ does: 'Open the month', motion: { kind: 'tap' } }],
    inside: [
      {
        title: 'A month',
        gestures: [
          { does: 'Up to the months', motion: { kind: 'thumb', way: 'up' } },
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
