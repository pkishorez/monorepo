import { createContext, useContext } from 'react';

export interface PanelSlots {
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
