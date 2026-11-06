import { createContext, useContext } from 'react';
import type { Item } from './todos.ts';

/**
 * The list as the view has it now, for its rows. A row that is leaving
 * is drawn from here too, so a to-do just completed shows its tick as it
 * goes.
 */
export type List = {
  readonly items: ReadonlyMap<string, Item>;
  readonly toggle: (id: string) => void;
  readonly remove: (id: string) => void;
};

export const ListContext = createContext<List>({
  items: new Map(),
  toggle: () => {},
  remove: () => {},
});
export const useList = () => useContext(ListContext);
