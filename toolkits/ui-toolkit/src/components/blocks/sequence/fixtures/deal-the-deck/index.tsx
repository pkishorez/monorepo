import { useSteps } from '../../index';
import { Demo, frames } from '../shared';

import { DECK } from './model';
import { deal } from './scene';

export function DealTheDeck() {
  const seq = useSteps(
    ...frames(
      deal,
      [...DECK, DECK.length].map((dealt) => ({ dealt })),
    ),
  );
  return (
    <Demo
      sequence={seq}
      caption="Cards glide from the stacked deck into a fanned hand, one per frame — layoutId + rotate/translate transforms."
    />
  );
}
