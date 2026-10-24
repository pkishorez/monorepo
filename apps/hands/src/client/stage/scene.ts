import type { Fired, HandId, Reading } from '../../shared/gestures/index.ts';

/*
 * What is on the stage, and how gestures move it: targets a pinch lights,
 * a card a pinch drags, a square both hands zoom and turn, slides a swipe
 * turns, a dial a fist twists, lines the index draws. Positions are 0 to 1
 * across the stage, which is the camera image, mirrored; a radius is a
 * share of its height. It changes 30 times a second, so it lives here and
 * is drawn on a canvas, never as the app's Model.
 */

export const TARGETS = [0.12, 0.22, 0.32].map((x) => ({ x, y: 0.14, r: 0.05 }));
export const CARD = { w: 0.16, h: 0.12 };
export const SQUARE = { x: 0.5, y: 0.5, size: 0.16 };
export const DIAL = { x: 0.9, y: 0.16, r: 0.075 };
export const SLIDES = 5;
export const ROWS = 8;

/** How long a line, a ring and a flash last, in ms. */
export const LINE_LIFE = 3000;
export const RING_LIFE = 600;
export const FLASH_LIFE = 400;

export interface Line {
  readonly hand: HandId;
  points: Array<{ x: number; y: number; at: number }>;
  open: boolean;
}

export class Scene {
  lit = TARGETS.map(() => false);
  card = { x: 0.78, y: 0.36 };
  /** The hand holding the card, and where on it it took hold. */
  grab: { hand: HandId; dx: number; dy: number } | null = null;
  square = { scale: 1, rotation: 0 };
  private squareFrom: { scale: number; rotation: number } | null = null;
  slide = 0;
  row = 0;
  dial = 50;
  lines: Array<Line> = [];
  rings: Array<{ x: number; y: number; at: number }> = [];
  flashedAt = -Infinity;

  apply(reading: Reading, fired: ReadonlyArray<Fired>) {
    const { at, aspect } = reading;
    const hand = (id: HandId | null) =>
      reading.hands.find((each) => each.id === id);

    for (const { gesture, hand: id } of fired) {
      const cursor = hand(id)?.cursor;
      switch (gesture) {
        case 'Pinch': {
          if (cursor === undefined) break;
          TARGETS.forEach((target, i) => {
            if (
              Math.hypot((cursor.x - target.x) * aspect, cursor.y - target.y) <
              target.r
            )
              this.lit[i] = !this.lit[i];
          });
          const inCard =
            Math.abs(cursor.x - this.card.x) < CARD.w / 2 &&
            Math.abs(cursor.y - this.card.y) < CARD.h / 2;
          if (inCard && id !== null)
            this.grab = {
              hand: id,
              dx: cursor.x - this.card.x,
              dy: cursor.y - this.card.y,
            };
          break;
        }
        case 'MiddlePinch':
          if (cursor !== undefined) this.rings.push({ ...cursor, at });
          break;
        case 'SwipeLeft':
          this.slide = (this.slide + SLIDES - 1) % SLIDES;
          break;
        case 'SwipeRight':
          this.slide = (this.slide + 1) % SLIDES;
          break;
        case 'SwipeUp':
          this.row = Math.min(this.row + 1, ROWS - 1);
          break;
        case 'SwipeDown':
          this.row = Math.max(this.row - 1, 0);
          break;
        case 'Push':
          this.flashedAt = at;
          break;
      }
    }

    // The card follows the hand holding it until it lets go.
    const holder = this.grab && hand(this.grab.hand);
    if (this.grab && holder?.pinch.down) {
      this.card = {
        x: Math.min(Math.max(holder.cursor.x - this.grab.dx, 0), 1),
        y: Math.min(Math.max(holder.cursor.y - this.grab.dy, 0), 1),
      };
    } else {
      this.grab = null;
    }

    // Both hands zoom and turn the square from where it was when they took hold.
    if (reading.twoHands) {
      this.squareFrom ??= { ...this.square };
      this.square = {
        scale: Math.min(
          Math.max(this.squareFrom.scale * reading.twoHands.scale, 0.4),
          3,
        ),
        rotation: this.squareFrom.rotation + reading.twoHands.rotation,
      };
    } else {
      this.squareFrom = null;
    }

    for (const each of reading.hands) {
      this.dial = Math.min(Math.max(this.dial + each.turn / 2, 0), 100);
      const line = this.lines.find((l) => l.hand === each.id && l.open);
      if (each.drawing) {
        const point = { ...each.cursor, at };
        if (line) line.points.push(point);
        else this.lines.push({ hand: each.id, points: [point], open: true });
      } else if (line) {
        line.open = false;
      }
    }
    for (const line of this.lines) {
      if (!reading.hands.some((each) => each.id === line.hand))
        line.open = false;
      line.points = line.points.filter((p) => at - p.at < LINE_LIFE);
    }
    this.lines = this.lines.filter(
      (line) => line.open || line.points.length > 0,
    );
    this.rings = this.rings.filter((ring) => at - ring.at < RING_LIFE);
  }
}
