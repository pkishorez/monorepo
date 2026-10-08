import { useCallback, useRef } from 'react';
import { animate, motionValue, type MotionValue } from 'motion/react';

import type { Camera } from './camera';
import type { CardMap, PlacedCard, Rect } from './geometry';

export interface CardValues {
  readonly x: MotionValue<number>;
  readonly y: MotionValue<number>;
  readonly width: MotionValue<number>;
  readonly height: MotionValue<number>;
  readonly opacity: MotionValue<number>;
}

interface Tracked extends CardValues {
  /** Where it was last sent; undefined while it is not shown. */
  target: Rect | undefined;
}

/**
 * How cards reach their new places: `jump` puts them there, `glide` plays
 * them there from where they were on screen.
 */
export type Placement = 'jump' | 'glide';

/** Every card, and the camera, move as one: the same curve and length. */
export const flip = { duration: 0.35, ease: [0.22, 1, 0.36, 1] } as const;
const fade = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;

/**
 * The motion values every card is drawn from, and how cards move to a new
 * map. Moving is FLIP: the map and the camera are already final; each card
 * starts drawn where it was on screen under the old camera (`from`) and
 * plays to its place under the new one (`to`), so the camera never tweens
 * on its own and every card travels one straight, eased path.
 */
export function useCardMotion() {
  const values = useRef(new Map<string, Tracked>());

  const valuesOf = useCallback((key: string): CardValues => {
    let tracked = values.current.get(key);
    if (tracked === undefined) {
      tracked = {
        x: motionValue(0),
        y: motionValue(0),
        width: motionValue(0),
        height: motionValue(0),
        opacity: motionValue(0),
        target: undefined,
      };
      values.current.set(key, tracked);
    }
    return tracked;
  }, []);

  const place = useCallback(
    (
      map: CardMap,
      previous: CardMap | undefined,
      view: { readonly from: Camera; readonly to: Camera },
      placement: Placement,
      reducedMotion: boolean,
    ) => {
      const moving = placement === 'glide' && !reducedMotion;
      const { from, to } = view;
      const still = from.x === to.x && from.y === to.y && from.zoom === to.zoom;
      // First: where a shown card is drawn now, in the space under the new camera.
      const seen = (tracked: Tracked): Rect => ({
        x: (tracked.x.get() * from.zoom + from.x - to.x) / to.zoom,
        y: (tracked.y.get() * from.zoom + from.y - to.y) / to.zoom,
        width: (tracked.width.get() * from.zoom) / to.zoom,
        height: (tracked.height.get() * from.zoom) / to.zoom,
      });
      const before = new Map<string, Rect>();
      for (const [key, tracked] of values.current)
        if (tracked.target !== undefined) before.set(key, seen(tracked));

      // Invert, then play: from where it was seen to where it goes.
      const send = (tracked: Tracked, start: Rect, end: Rect) => {
        for (const side of ['x', 'y', 'width', 'height'] as const) {
          tracked[side].jump(start[side]);
          if (moving) void animate(tracked[side], end[side], flip);
          else tracked[side].jump(end[side]);
        }
      };

      for (const card of map.cards) {
        const tracked = valuesOf(card.key) as Tracked;
        const was = before.get(card.key);
        if (was === undefined) {
          // Entering: out from behind where its parent was seen.
          const parent =
            card.parentKey === null ? undefined : before.get(card.parentKey);
          const start =
            moving && parent !== undefined ? tucked(card, parent) : card;
          tracked.opacity.jump(start === card ? 1 : 0);
          if (start !== card) void animate(tracked.opacity, 1, fade);
          tracked.target = card;
          send(tracked, start, card);
          continue;
        }
        if (still && sameRect(tracked.target!, card)) continue;
        tracked.target = card;
        send(tracked, was, card);
      }

      for (const card of previous?.cards ?? []) {
        if (map.byKey.has(card.key)) continue;
        const tracked = values.current.get(card.key);
        const was = before.get(card.key);
        if (tracked === undefined || was === undefined) continue;
        tracked.target = undefined;
        // Leaving: back behind the nearest shown ancestor, where it now goes.
        send(tracked, was, foldTarget(card, previous!, map) ?? was);
      }
    },
    [valuesOf],
  );

  return { valuesOf, place };
}

/** Where a new card starts: tucked behind the right edge of the card that opened it. */
function tucked(card: PlacedCard, parent: Rect): Rect {
  return {
    x: parent.x + parent.width - card.width,
    y: parent.y + parent.height / 2 - card.height / 2,
    width: card.width,
    height: card.height,
  };
}

/** Where a removed card folds back to: its nearest ancestor still shown. */
function foldTarget(
  card: PlacedCard,
  previous: CardMap,
  map: CardMap,
): Rect | undefined {
  let parentKey = card.parentKey;
  while (parentKey !== null) {
    const shown = map.byKey.get(parentKey);
    if (shown !== undefined) {
      return {
        x: shown.x + shown.width - card.width,
        y: shown.y + shown.height / 2 - card.height / 2,
        width: card.width,
        height: card.height,
      };
    }
    parentKey = previous.byKey.get(parentKey)?.parentKey ?? null;
  }
  return undefined;
}

function sameRect(a: Rect, b: Rect): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}
