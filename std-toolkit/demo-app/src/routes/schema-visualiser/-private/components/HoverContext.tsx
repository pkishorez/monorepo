import { createContext, useContext } from 'react';

export interface HoverContextValue {
  hoveredConnection: string | null;
  setHoveredConnection: (connection: string | null) => void;
}

export const HoverContext = createContext<HoverContextValue>({
  hoveredConnection: null,
  setHoveredConnection: () => {},
});

export const useHoverContext = () => useContext(HoverContext);
