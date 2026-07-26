import type { StateMachineLayout, StateMachineViewport } from '../types';

export const STATE_WIDTH = 184;
export const STATE_HEIGHT = 76;
export const COLLAPSED_STATE_HEIGHT = 44;
export const INITIAL_INDICATOR_SIZE = 14;
export const CONTAINER_HEADER_HEIGHT = 48;
export const CONTAINER_HEADER_GAP = 12;
export const CONTAINER_PADDING = 22;
export const EDGE_LABEL_HEIGHT = 22;
export const EDGE_LABEL_MINIMUM_WIDTH = 38;
export const EDGE_LABEL_WRAP_LENGTH = 16;
export const DIAGRAM_PADDING = 28;

export function getEdgeLabelSize(label: string) {
  return {
    width: label
      ? Math.min(
          120,
          Math.max(EDGE_LABEL_MINIMUM_WIDTH, label.length * 6.5 + 18),
        )
      : 0,
    height:
      label.length > EDGE_LABEL_WRAP_LENGTH
        ? Math.min(
            34,
            Math.ceil(label.length / EDGE_LABEL_WRAP_LENGTH) * 13 + 6,
          )
        : EDGE_LABEL_HEIGHT,
  };
}

export function getFitViewport(
  layout: StateMachineLayout,
  padding = DIAGRAM_PADDING,
): StateMachineViewport {
  return {
    x: -padding,
    y: -padding,
    width: layout.width + padding * 2,
    height: layout.height + padding * 2,
  };
}
