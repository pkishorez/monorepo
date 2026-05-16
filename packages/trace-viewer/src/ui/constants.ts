export const TIMELINE_LAYOUT = {
  ROW_HEIGHT_PX: 40,
  GAP_MARGIN_PX: 2,
  GRID_MARGIN_TOP_PX: 0,
  LIVEBAR_WIDTH: 30,
} as const;

export const SPAN_LAYOUT = {
  MARGIN_PX: 2,
  BASE_HEIGHT_PX: 20,
} as const;

export const ANIMATION = {
  DURATION_S: 0.2,
  EASE: 'easeOut',
} as const;

export const transition = {
  ease: ANIMATION.EASE,
  duration: ANIMATION.DURATION_S,
} as const;

export const SPAN_INFO_LAYOUT = {
  PANEL_MAX_WIDTH_PX: 500,
  PANEL_OFFSET_PX: 8,
  PANEL_PADDING_PX: 10,
  SHIFT_PADDING_PX: 15,
} as const;
