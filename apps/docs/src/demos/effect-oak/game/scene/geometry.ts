/*
 * Road units to SVG. The road's shape comes from whoever draws it; these
 * numbers are drawing only, and no rule depends on them.
 */

/** What the scene needs to know about the road, in road units. */
export type RoadShape = {
  readonly lanes: number;
  readonly laneWidth: number;
  /** How much road is in sight, front to back. */
  readonly roadLength: number;
  /** One painted dash of a divider, and the gap after it. */
  readonly dash: number;
  readonly gap: number;
  readonly car: { readonly width: number; readonly length: number };
};

/** Tarmac painted outside each edge line. */
export const SHOULDER = 12;
/** Space between the car's tail and the bottom of the view. */
const CAR_GAP = 20;
export const DIVIDER_WIDTH = 3;

export const roadWidth = (road: RoadShape) =>
  SHOULDER * 2 + road.lanes * road.laneWidth;

/** Left edge of a lane; lane `lanes` is the right edge of the road. */
export const laneEdge = (road: RoadShape, lane: number) =>
  SHOULDER + lane * road.laneWidth;

/** Where the car's top-left corner goes, centred on a lane (fractional lanes are between two). */
export const carAt = (road: RoadShape, lane: number) => ({
  x: laneEdge(road, lane + 0.5) - road.car.width / 2,
  y: road.roadLength - road.car.length - CAR_GAP,
});

/** How far down the dividers have moved, after driving `driven`: they repeat every dash and gap. */
export const dividerShift = (road: RoadShape, driven: number) =>
  driven % (road.dash + road.gap);
