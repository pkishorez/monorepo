import { createContext, useContext } from 'react';
import type { Card, Mode, Part, Use } from '../../../logic/shared/index.ts';

export interface Carded {
  readonly card: Card;
  readonly mode: Mode;
  readonly services: boolean;
  readonly focus: Part | undefined;
  readonly uses: ReadonlyArray<Use>;
  readonly onChild: (slot: string) => void;
  readonly onCapability: (name: string, side: 'requires' | 'provides') => void;
}

export const CardContext = createContext<Carded | null>(null);

export const useCard = (): Carded => {
  const carded = useContext(CardContext);
  if (!carded) throw new Error('A card body is drawn inside its card');
  return carded;
};
