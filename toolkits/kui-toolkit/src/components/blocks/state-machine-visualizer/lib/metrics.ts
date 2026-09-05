import type { StateMachineDiagram, StateMachineViewport } from '../types';

export const STATE_WIDTH = 184;
export const STATE_HEIGHT = 76;
const STATE_BORDER_WIDTH = 2;
const STATE_HEADER_HEIGHT = 40;
export const COLLAPSED_STATE_HEIGHT =
  STATE_HEADER_HEIGHT + STATE_BORDER_WIDTH * 2;
const STATE_HORIZONTAL_PADDING = 12;
export const DESCRIPTION_LINE_HEIGHT = 16;
export const DESCRIPTION_BLOCK_PADDING = 17;
const DESCRIPTION_CHARACTER_WIDTH = 5.2;
export const MAX_DESCRIPTION_LINES = 4;
export const INITIAL_INDICATOR_SIZE = 14;
export const CONTAINER_HEADER_HEIGHT = 48;
export const CONTAINER_HEADER_GAP = 12;
export const CONTAINER_PADDING = 22;
export const EDGE_LABEL_HEIGHT = 22;
export const EDGE_LABEL_MINIMUM_WIDTH = 38;
export const EDGE_LABEL_WRAP_LENGTH = 16;
export const DIAGRAM_PADDING = 28;

function countWrappedLines(
  paragraph: string,
  charactersPerLine: number,
): number {
  const words = paragraph.split(/\s+/).filter(Boolean);
  let lines = 1;
  let used = 0;

  for (const word of words) {
    const needed = used === 0 ? word.length : used + 1 + word.length;

    if (needed > charactersPerLine && used > 0) {
      lines += 1;
      used = word.length;
    } else {
      used = needed;
    }

    while (used > charactersPerLine) {
      lines += 1;
      used -= charactersPerLine;
    }
  }

  return lines;
}

export function getDescriptionLineCount(description: string): number {
  const charactersPerLine = Math.floor(
    (STATE_WIDTH - STATE_HORIZONTAL_PADDING * 2) / DESCRIPTION_CHARACTER_WIDTH,
  );
  const wrapped = description
    .split(/\s*\n\s*/)
    .reduce(
      (total, paragraph) =>
        total + countWrappedLines(paragraph, charactersPerLine),
      0,
    );

  return Math.min(MAX_DESCRIPTION_LINES, Math.max(1, wrapped));
}

export function getStateNodeHeight(description?: string): number {
  if (!description) return COLLAPSED_STATE_HEIGHT;

  return (
    COLLAPSED_STATE_HEIGHT +
    DESCRIPTION_BLOCK_PADDING +
    getDescriptionLineCount(description) * DESCRIPTION_LINE_HEIGHT
  );
}

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
  diagram: StateMachineDiagram,
  padding = DIAGRAM_PADDING,
): StateMachineViewport {
  return {
    x: -padding,
    y: -padding,
    width: diagram.width + padding * 2,
    height: diagram.height + padding * 2,
  };
}
