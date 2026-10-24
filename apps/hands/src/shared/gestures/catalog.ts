import { Schema } from 'effect';

/*
 * Every gesture the playground knows, in the order the checklist shows
 * them, grouped by what they test: MediaPipe gives only 21 points and a
 * shape label per hand, so all but the Shapes are this app's own math on
 * those points.
 */

export const GESTURES = [
  'Pinch',
  'Drag',
  'MiddlePinch',
  'Closed_Fist',
  'Open_Palm',
  'Pointing_Up',
  'Thumb_Up',
  'Thumb_Down',
  'Victory',
  'ILoveYou',
  'Count',
  'SwipeLeft',
  'SwipeRight',
  'SwipeUp',
  'SwipeDown',
  'Dial',
  'Push',
  'Draw',
  'Zoom',
  'Rotate',
  'HandIn',
  'HandOut',
  'TwoHands',
] as const;

export const Gesture = Schema.Literals(GESTURES);
export type Gesture = typeof Gesture.Type;

/** The shapes MediaPipe's Gesture Recognizer names itself, besides `None`. */
export const SHAPES = [
  'Closed_Fist',
  'Open_Palm',
  'Pointing_Up',
  'Thumb_Up',
  'Thumb_Down',
  'Victory',
  'ILoveYou',
] as const satisfies ReadonlyArray<Gesture>;

export type Shape = (typeof SHAPES)[number];

export const isShape = (name: string): name is Shape =>
  (SHAPES as ReadonlyArray<string>).includes(name);

export interface Entry {
  readonly gesture: Gesture;
  readonly name: string;
  /** What to do with your hand. */
  readonly how: string;
  /** What it does on the stage. */
  readonly does: string;
}

export interface Group {
  readonly name: string;
  readonly entries: ReadonlyArray<Entry>;
}

export const CATALOG: ReadonlyArray<Group> = [
  {
    name: 'Point and click',
    entries: [
      {
        gesture: 'Pinch',
        name: 'Pinch',
        how: 'Touch thumb and index tips',
        does: 'Clicks: lights a target under the cursor',
      },
      {
        gesture: 'Drag',
        name: 'Drag',
        how: 'Pinch on the card and move',
        does: 'Moves the card',
      },
      {
        gesture: 'MiddlePinch',
        name: 'Middle pinch',
        how: 'Touch thumb and middle tips',
        does: 'Right-click: a ring at the cursor',
      },
    ],
  },
  {
    name: 'Shapes (MediaPipe)',
    entries: [
      {
        gesture: 'Closed_Fist',
        name: 'Fist',
        how: 'Close your hand',
        does: 'Recognised by the model',
      },
      {
        gesture: 'Open_Palm',
        name: 'Open palm',
        how: 'Show your palm, fingers spread',
        does: 'Recognised by the model',
      },
      {
        gesture: 'Pointing_Up',
        name: 'Pointing up',
        how: 'Index finger up',
        does: 'Recognised by the model',
      },
      {
        gesture: 'Thumb_Up',
        name: 'Thumbs up',
        how: 'Thumb up, fist closed',
        does: 'Recognised by the model',
      },
      {
        gesture: 'Thumb_Down',
        name: 'Thumbs down',
        how: 'Thumb down, fist closed',
        does: 'Recognised by the model',
      },
      {
        gesture: 'Victory',
        name: 'Victory',
        how: 'Index and middle up, apart',
        does: 'Recognised by the model',
      },
      {
        gesture: 'ILoveYou',
        name: 'I love you',
        how: 'Thumb, index and pinky out',
        does: 'Recognised by the model',
      },
    ],
  },
  {
    name: 'Counting',
    entries: [
      {
        gesture: 'Count',
        name: 'Count 0 to 5',
        how: 'Hold up fingers, one hand at a time',
        does: 'Shows the number; each one seen is ticked',
      },
    ],
  },
  {
    name: 'Motion',
    entries: [
      {
        gesture: 'SwipeLeft',
        name: 'Swipe left',
        how: 'Open palm, sweep left',
        does: 'Previous slide',
      },
      {
        gesture: 'SwipeRight',
        name: 'Swipe right',
        how: 'Open palm, sweep right',
        does: 'Next slide',
      },
      {
        gesture: 'SwipeUp',
        name: 'Swipe up',
        how: 'Open palm, sweep up',
        does: 'Scrolls the list up',
      },
      {
        gesture: 'SwipeDown',
        name: 'Swipe down',
        how: 'Open palm, sweep down',
        does: 'Scrolls the list down',
      },
      {
        gesture: 'Dial',
        name: 'Twist',
        how: 'Make a fist and turn it like a knob',
        does: 'Turns the dial',
      },
      {
        gesture: 'Push',
        name: 'Push',
        how: 'Open palm, push toward the camera',
        does: 'Presses: the stage flashes',
      },
      {
        gesture: 'Draw',
        name: 'Air draw',
        how: 'Only the index finger out, move it',
        does: 'Draws a line that fades',
      },
    ],
  },
  {
    name: 'Two hands',
    entries: [
      {
        gesture: 'Zoom',
        name: 'Zoom',
        how: 'Pinch with both hands, pull apart or together',
        does: 'Scales the square',
      },
      {
        gesture: 'Rotate',
        name: 'Rotate',
        how: 'Pinch with both hands, turn them around each other',
        does: 'Rotates the square',
      },
    ],
  },
  {
    name: 'Tracking',
    entries: [
      {
        gesture: 'HandIn',
        name: 'Hand in',
        how: 'Bring a hand into view',
        does: 'Gets a cursor and a letter',
      },
      {
        gesture: 'HandOut',
        name: 'Hand out',
        how: 'Take a hand out of view',
        does: 'Its cursor goes',
      },
      {
        gesture: 'TwoHands',
        name: 'Two hands',
        how: 'Both hands in view',
        does: 'Two cursors, A and B, kept apart by position',
      },
    ],
  },
];
