/**
 * The engine under every canvas of cards: a bounded, pannable, zoomable
 * space, the camera that frames it, cards that FLIP to their new places,
 * and the walk between them. Nothing here knows what a card shows.
 */
export { cardMapOf, unionRect } from './geometry';
export type { CardMap, PlacedCard, Point, Rect, Size } from './geometry';
export {
  aimCamera,
  clampCamera,
  focusPadding,
  frameHeight,
  frameRect,
  maxHiddenShare,
  nudgeIntoView,
  nudgeTowardCentre,
  openingCamera,
  revealRect,
  visibleRect,
  zoomAt,
  zoomLimits,
} from './camera';
export type { Aim, Camera } from './camera';
export { zoneAttribute } from './pointer-source';
export { useSpace } from './use-space';
export type { Space } from './use-space';
export { CardFrame } from './card-frame';
export { flip, useCardMotion } from './use-card-motion';
export type { CardValues, Placement } from './use-card-motion';
export { walkFocus } from './focus-walk';
export type { FocusStep, Walk } from './focus-walk';
export { keepsKeys, keyLabel, nativeControls, useActiveElement } from './keys';
export {
  HintLine,
  SidePanel,
  SpaceViewport,
  ZoomControls,
} from './space-chrome';
