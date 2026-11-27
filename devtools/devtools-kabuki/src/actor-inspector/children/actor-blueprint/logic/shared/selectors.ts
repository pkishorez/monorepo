import type { DataOf } from '@kestack/kabuki/types';
import type { BlueprintNode, Card } from '../../../../logic/shared/index.ts';
import type { BlueprintShape } from './shape.ts';

export const printedCard = (print: BlueprintNode): Card => ({
  id: print.place,
  name: print.slot ?? print.actor,
  print,
  state: null,
  change: null,
  children: print.children.map(printedCard),
});

export const cardsOf = ({
  model,
}: DataOf<typeof BlueprintShape>): Card | null =>
  model.root ? printedCard(model.root) : null;
