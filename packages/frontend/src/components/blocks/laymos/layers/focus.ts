import type { LayerInteraction } from './model';

export interface LayerFocus {
  readonly focusedLayerId?: string;
  readonly hoverEnabled: boolean;
  readonly activationEnabled: boolean;
}

export function resolveLayerFocus({
  activeLayerId,
  hoveredLayerId,
  blocked = false,
}: Pick<LayerInteraction, 'activeLayerId' | 'hoveredLayerId'> & {
  readonly blocked?: boolean;
}): LayerFocus {
  if (blocked) {
    return { hoverEnabled: false, activationEnabled: false };
  }

  if (activeLayerId !== undefined) {
    return {
      focusedLayerId: activeLayerId,
      hoverEnabled: false,
      activationEnabled: true,
    };
  }

  return {
    ...(hoveredLayerId === undefined ? {} : { focusedLayerId: hoveredLayerId }),
    hoverEnabled: true,
    activationEnabled: true,
  };
}
