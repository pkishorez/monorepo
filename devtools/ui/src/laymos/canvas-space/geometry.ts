export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Point, Size {}

/** One card placed in the space, keyed by what it shows. */
export interface PlacedCard extends Rect {
  readonly key: string;
  readonly parentKey: string | null;
  /** Keys of the cards shown as its children, in walking order. */
  readonly children: readonly string[];
}

/** Every card placed, parents before their children. */
export interface CardMap<Card extends PlacedCard = PlacedCard> {
  readonly cards: readonly Card[];
  readonly byKey: ReadonlyMap<string, Card>;
  /** The smallest rectangle around every card; empty at the origin when none. */
  readonly bounds: Rect;
}

export function unionRect(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function cardMapOf<Card extends PlacedCard>(
  cards: readonly Card[],
): CardMap<Card> {
  return {
    cards,
    byKey: new Map(cards.map((card) => [card.key, card])),
    bounds: unionRect(cards),
  };
}
