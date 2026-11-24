import { createContext, useContext } from 'react';

/*
 * Where the tree's own controls go on a wide screen: the side panels hold
 * a place for what is selected and one for opening every folder, and the
 * tree draws them there instead of over itself, once they are in place.
 */

export interface PanelSlots {
  /** Wide: the side panels are drawn, so the tree draws nothing over itself. */
  readonly docked: boolean;
  readonly selection: HTMLElement | null;
  readonly folders: HTMLElement | null;
}

export const PanelSlotsContext = createContext<PanelSlots>({
  docked: false,
  selection: null,
  folders: null,
});

export const usePanelSlots = (): PanelSlots => useContext(PanelSlotsContext);
