import { isShape } from './catalog.ts';
import {
  INDEX_TIP,
  MIDDLE_KNUCKLE,
  MIDDLE_TIP,
  THUMB_TIP,
  WRIST,
  distance,
  fingersOf,
  flatDistance,
  palmCentre,
  wrap,
} from './geometry.ts';
import type {
  Fired,
  Frame,
  HandId,
  HandReading,
  Point,
  RawHand,
  Reading,
  TwoHands,
} from './hand.ts';
import { OneEuro } from './one-euro.ts';

/*
 * Turns MediaPipe's frames into readings and gestures. MediaPipe gives no
 * gestures beyond its shapes, keeps no hand's identity from one frame to
 * the next and smooths nothing, so this does all three: it follows each
 * hand by where it is, smooths its points with a One Euro filter, and
 * fires each gesture once, with separate thresholds to start and end it
 * so a hand on the edge does not flicker.
 */

/** Pinched below this share of the palm's length, apart again above the next. */
const PINCH_DOWN = 0.3;
const PINCH_UP = 0.45;
/**
 * How far a fingertip must reach from the wrist, as a share of the palm's
 * length, to pinch: a pinching finger is bent but out, a fist's is curled
 * back into the palm, where the thumb rests against it.
 */
const PINCH_REACH = 1.2;
/** How far apart, on screen, a hand may move between frames and stay the same hand. */
const SAME_HAND = 0.35;
/** How long a lost hand is kept before it counts as gone, in ms. */
const GRACE = 250;
/** How long a count or a shape must hold before it fires, in ms. */
const STEADY = 250;
const SWIPE_WINDOW = 300;
/** How far an open palm must sweep in the window, as a share of the image height. */
const SWIPE_DISTANCE = 0.18;
const SWIPE_COOLDOWN = 700;
const PUSH_WINDOW = 350;
/** How much bigger a hand must get in the window to count as a push. */
const PUSH_GROWTH = 1.3;
const PUSH_COOLDOWN = 900;
/** Degrees a fist must turn before the twist fires. */
const DIAL_FIRE = 25;
/** How far a pinch must move before it is a drag. */
const DRAG_FIRE = 0.06;
/** How long a line must be before the drawing fires. */
const DRAW_FIRE = 0.2;
/** How much both hands must zoom or turn before it fires. */
const ZOOM_FIRE = 1.25;
const ROTATE_FIRE = 20;

export interface Options {
  readonly smoothing: boolean;
}

interface Sample {
  readonly at: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

interface Track {
  readonly id: HandId;
  readonly filters: ReadonlyArray<OneEuro>;
  centre: { x: number; y: number };
  seen: number;
  visible: boolean;
  reading: HandReading | null;
  pinch: { down: boolean; from: { x: number; y: number }; dragged: boolean };
  middleDown: boolean;
  count: { value: number; since: number; fired: number | null };
  shape: { name: string; since: number; fired: string | null };
  trail: Array<Sample>;
  swipedAt: number;
  pushedAt: number;
  dial: { last: number | null; turned: number; fired: boolean };
  draw: {
    last: { x: number; y: number } | null;
    length: number;
    fired: boolean;
  };
}

const newTrack = (id: HandId, at: number): Track => ({
  id,
  filters: Array.from({ length: 63 }, () => new OneEuro()),
  centre: { x: 0, y: 0 },
  seen: at,
  visible: true,
  reading: null,
  pinch: { down: false, from: { x: 0, y: 0 }, dragged: false },
  middleDown: false,
  count: { value: -1, since: at, fired: null },
  shape: { name: 'None', since: at, fired: null },
  trail: [],
  swipedAt: -Infinity,
  pushedAt: -Infinity,
  dial: { last: null, turned: 0, fired: false },
  draw: { last: null, length: 0, fired: false },
});

const mirror = (points: ReadonlyArray<Point>): Array<Point> =>
  points.map(({ x, y, z }) => ({ x: 1 - x, y, z }));

export class Interpreter {
  private tracks: Array<Track> = [];
  private both: {
    distance: number;
    angle: number;
    zoomed: boolean;
    turned: boolean;
  } | null = null;
  private wasTwo = false;

  step(
    frame: Frame,
    options: Options,
  ): { readonly reading: Reading; readonly fired: ReadonlyArray<Fired> } {
    const fired: Array<Fired> = [];
    const fire = (
      gesture: Fired['gesture'],
      hand: HandId | null,
      detail = '',
    ) => fired.push({ gesture, hand, detail });

    const raws = frame.hands.map((hand) => ({
      hand,
      points: mirror(hand.points),
    }));
    const matched = this.match(
      raws.map(({ points }) => palmCentre(points)),
      frame.aspect,
    );

    for (const track of this.tracks) track.visible = false;
    raws.forEach(({ hand, points }, i) => {
      let track = matched[i];
      if (track === undefined) {
        const id = (['A', 'B'] as const).find(
          (free) => !this.tracks.some((each) => each.id === free),
        );
        if (id === undefined) return;
        track = newTrack(id, frame.at);
        this.tracks.push(track);
        fire('HandIn', id);
      }
      track.visible = true;
      track.seen = frame.at;
      track.centre = palmCentre(points);
      track.reading = this.read(track, hand, points, frame, options, fire);
    });

    this.tracks = this.tracks.filter((track) => {
      const gone = !track.visible && frame.at - track.seen > GRACE;
      if (gone) fire('HandOut', track.id);
      return !gone;
    });

    const hands = this.tracks
      .filter((track) => track.visible && track.reading !== null)
      .map((track) => track.reading!)
      .sort((a, b) => a.id.localeCompare(b.id));

    const two = hands.length === 2;
    if (two && !this.wasTwo) fire('TwoHands', null);
    this.wasTwo = two;

    return {
      reading: {
        at: frame.at,
        aspect: frame.aspect,
        hands,
        twoHands: this.twoHands(hands, frame.aspect, fire),
      },
      fired,
    };
  }

  /** Each raw hand's track: the nearest one, closest pairs first. */
  private match(
    centres: ReadonlyArray<{ x: number; y: number }>,
    aspect: number,
  ): Array<Track | undefined> {
    const pairs = centres
      .flatMap((centre, i) =>
        this.tracks.map((track) => ({
          i,
          track,
          far: Math.hypot(
            (centre.x - track.centre.x) * aspect,
            centre.y - track.centre.y,
          ),
        })),
      )
      .filter(({ far }) => far < SAME_HAND)
      .sort((a, b) => a.far - b.far);
    const result: Array<Track | undefined> = centres.map(() => undefined);
    const taken = new Set<Track>();
    for (const { i, track } of pairs) {
      if (result[i] !== undefined || taken.has(track)) continue;
      result[i] = track;
      taken.add(track);
    }
    return result;
  }

  private read(
    track: Track,
    hand: RawHand,
    raw: ReadonlyArray<Point>,
    frame: Frame,
    options: Options,
    fire: (
      gesture: Fired['gesture'],
      hand: HandId | null,
      detail?: string,
    ) => void,
  ): HandReading {
    const { at, aspect } = frame;
    const points = raw.map((point, i) => {
      const [fx, fy, fz] = [0, 1, 2].map(
        (axis) => track.filters[i * 3 + axis]!,
      );
      const x = fx!.next(point.x, at);
      const y = fy!.next(point.y, at);
      const z = fz!.next(point.z, at);
      return options.smoothing ? { x, y, z } : point;
    });
    const cursor = { x: points[INDEX_TIP]!.x, y: points[INDEX_TIP]!.y };

    const fingers = fingersOf(hand.world);
    const [, index, middle, ring, pinky] = fingers;
    const count = fingers.filter(Boolean).length;
    const palm = distance(hand.world[WRIST]!, hand.world[MIDDLE_KNUCKLE]!);
    const pinchRatio =
      distance(hand.world[THUMB_TIP]!, hand.world[INDEX_TIP]!) / palm;
    const middleRatio =
      distance(hand.world[THUMB_TIP]!, hand.world[MIDDLE_TIP]!) / palm;
    const reaches = (tip: number) =>
      distance(hand.world[WRIST]!, hand.world[tip]!) / palm > PINCH_REACH;

    // Pinch, and a drag once it moves.
    const pinch = track.pinch;
    if (
      !pinch.down &&
      pinchRatio < PINCH_DOWN &&
      pinchRatio < middleRatio &&
      reaches(INDEX_TIP)
    ) {
      track.pinch = { down: true, from: cursor, dragged: false };
      fire('Pinch', track.id);
    } else if (pinch.down && pinchRatio > PINCH_UP) {
      track.pinch = { ...pinch, down: false };
    } else if (
      pinch.down &&
      !pinch.dragged &&
      flatDistance({ ...pinch.from, z: 0 }, { ...cursor, z: 0 }, aspect) >
        DRAG_FIRE
    ) {
      track.pinch = { ...pinch, dragged: true };
      fire('Drag', track.id);
    }

    // Thumb to middle: the thumb nearer the middle tip than the index.
    if (
      !track.middleDown &&
      !track.pinch.down &&
      middleRatio < PINCH_DOWN &&
      middleRatio < pinchRatio &&
      reaches(MIDDLE_TIP)
    ) {
      track.middleDown = true;
      fire('MiddlePinch', track.id);
    } else if (track.middleDown && middleRatio > PINCH_UP) {
      track.middleDown = false;
    }

    // A count, once it holds.
    if (count !== track.count.value)
      track.count = { ...track.count, value: count, since: at };
    if (at - track.count.since >= STEADY && track.count.fired !== count) {
      track.count.fired = count;
      fire('Count', track.id, `${count}`);
    }

    // The model's shape, once it holds.
    const shape =
      hand.shape.score >= 0.6 && isShape(hand.shape.name)
        ? hand.shape.name
        : 'None';
    if (shape !== track.shape.name)
      track.shape = { ...track.shape, name: shape, since: at };
    if (at - track.shape.since >= STEADY && track.shape.fired !== shape) {
      track.shape.fired = shape;
      if (isShape(shape))
        fire(shape, track.id, `${Math.round(hand.shape.score * 100)}%`);
    }

    // Size on screen: wrist to middle knuckle, which grows as the hand comes closer.
    const size = flatDistance(points[WRIST]!, points[MIDDLE_KNUCKLE]!, aspect);
    const centre = palmCentre(points);
    const open = count >= 4 && !track.pinch.down;
    track.trail = open
      ? [
          ...track.trail.filter(
            (s) => at - s.at <= Math.max(SWIPE_WINDOW, PUSH_WINDOW),
          ),
          { at, x: centre.x * aspect, y: centre.y, size },
        ]
      : [];

    // A push: the open hand grows fast.
    const smallest = Math.min(...track.trail.map((s) => s.size));
    const growth = track.trail.length > 1 ? size / smallest : 1;
    if (open && growth > PUSH_GROWTH && at - track.pushedAt > PUSH_COOLDOWN) {
      track.pushedAt = at;
      track.trail = [];
      fire('Push', track.id);
    }

    // A swipe: the open hand sweeps one way, without coming closer.
    const first = track.trail.find((s) => at - s.at <= SWIPE_WINDOW);
    if (
      open &&
      first !== undefined &&
      growth < 1.15 &&
      at - track.swipedAt > SWIPE_COOLDOWN
    ) {
      const dx = centre.x * aspect - first.x;
      const dy = centre.y - first.y;
      const along = Math.max(Math.abs(dx), Math.abs(dy));
      const across = Math.min(Math.abs(dx), Math.abs(dy));
      if (along > SWIPE_DISTANCE && along > across * 2) {
        track.swipedAt = at;
        track.trail = [];
        fire(
          Math.abs(dx) > Math.abs(dy)
            ? dx > 0
              ? 'SwipeRight'
              : 'SwipeLeft'
            : dy > 0
              ? 'SwipeDown'
              : 'SwipeUp',
          track.id,
        );
      }
    }

    // A twist: a fist turning like a knob.
    const roll =
      (Math.atan2(
        (points[MIDDLE_KNUCKLE]!.x - points[WRIST]!.x) * aspect,
        points[WRIST]!.y - points[MIDDLE_KNUCKLE]!.y,
      ) *
        180) /
      Math.PI;
    const fist = !index && !middle && !ring && !pinky;
    let turn = 0;
    if (fist) {
      if (track.dial.last !== null) turn = wrap(roll - track.dial.last);
      track.dial = {
        ...track.dial,
        last: roll,
        turned: track.dial.turned + turn,
      };
      if (!track.dial.fired && Math.abs(track.dial.turned) > DIAL_FIRE) {
        track.dial.fired = true;
        fire(
          'Dial',
          track.id,
          track.dial.turned > 0 ? 'clockwise' : 'anticlockwise',
        );
      }
    } else {
      track.dial = { last: null, turned: 0, fired: false };
    }

    // Air drawing: only the index out.
    const drawing = index && !middle && !ring && !pinky && !track.pinch.down;
    if (drawing) {
      const last = track.draw.last;
      const length =
        track.draw.length +
        (last
          ? flatDistance({ ...last, z: 0 }, { ...cursor, z: 0 }, aspect)
          : 0);
      track.draw = { last: cursor, length, fired: track.draw.fired };
      if (!track.draw.fired && length > DRAW_FIRE) {
        track.draw.fired = true;
        fire('Draw', track.id);
      }
    } else {
      track.draw = { last: null, length: 0, fired: false };
    }

    return {
      id: track.id,
      points,
      cursor,
      handedness: hand.handedness,
      shape: hand.shape,
      fingers,
      count,
      pinch: { mm: pinchRatio * palm * 1000, down: track.pinch.down },
      middlePinch: { mm: middleRatio * palm * 1000, down: track.middleDown },
      roll,
      turn,
      size,
      drawing,
    };
  }

  /** Both hands pinching: their zoom and turn since they started, firing once each. */
  private twoHands(
    hands: ReadonlyArray<HandReading>,
    aspect: number,
    fire: (
      gesture: Fired['gesture'],
      hand: HandId | null,
      detail?: string,
    ) => void,
  ): TwoHands | null {
    const [a, b] = hands;
    if (a === undefined || b === undefined || !a.pinch.down || !b.pinch.down) {
      this.both = null;
      return null;
    }
    const pinchAt = (hand: HandReading) => {
      const thumb = hand.points[THUMB_TIP]!;
      const tip = hand.points[INDEX_TIP]!;
      return { x: ((thumb.x + tip.x) / 2) * aspect, y: (thumb.y + tip.y) / 2 };
    };
    const [pa, pb] = [pinchAt(a), pinchAt(b)];
    const apart = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    const angle = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
    if (this.both === null)
      this.both = { distance: apart, angle, zoomed: false, turned: false };
    const scale = apart / this.both.distance;
    const rotation = wrap(angle - this.both.angle);
    if (!this.both.zoomed && (scale > ZOOM_FIRE || scale < 1 / ZOOM_FIRE)) {
      this.both.zoomed = true;
      fire('Zoom', null, scale > 1 ? 'in' : 'out');
    }
    if (!this.both.turned && Math.abs(rotation) > ROTATE_FIRE) {
      this.both.turned = true;
      fire('Rotate', null, rotation > 0 ? 'clockwise' : 'anticlockwise');
    }
    return { scale, rotation };
  }
}
