import type { Ref } from 'react';
import type { RoadShape } from './geometry.js';
import { DIVIDER_WIDTH, laneEdge, roadWidth } from './geometry.js';

/** Edge lines, and the dividers between lanes in a group the Scene slides down. */
export const Road = ({
  road,
  dividers,
}: {
  readonly road: RoadShape;
  readonly dividers: Ref<SVGGElement>;
}) => {
  const period = road.dash + road.gap;
  const dashes = Math.ceil(road.roadLength / period) + 1;
  const edges = [laneEdge(road, 0), roadWidth(road) - laneEdge(road, 0)];
  return (
    <>
      <g className="stroke-neutral-400" strokeWidth={2}>
        {edges.map((x) => (
          <line key={x} x1={x} y1={0} x2={x} y2={road.roadLength} />
        ))}
      </g>
      <g ref={dividers} className="fill-neutral-300">
        {Array.from({ length: road.lanes - 1 }, (_, line) =>
          Array.from({ length: dashes }, (_, dash) => (
            <rect
              key={`${line}-${dash}`}
              x={laneEdge(road, line + 1) - DIVIDER_WIDTH / 2}
              y={(dash - 1) * period}
              width={DIVIDER_WIDTH}
              height={road.dash}
            />
          )),
        )}
      </g>
    </>
  );
};
