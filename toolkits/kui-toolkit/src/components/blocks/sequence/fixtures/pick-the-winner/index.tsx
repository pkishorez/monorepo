import { step, useSteps } from '../../index';
import { Demo } from '../shared';

import { ITEMS } from './model';
import { crown, lineup } from './scene';

/**
 * pick-the-winner — two distinctly-typed steps (lineup → crown), bridged by
 * `layoutId`. The top item flies across into the winner slot, a cross-container
 * move only `layoutId` can carry — even across different step types.
 */
export function PickTheWinner() {
  const seq = useSteps(
    step('step1', { items: ITEMS }, lineup),
    step('step2', { remaining: ITEMS.slice(1), winner: 'item-0' }, crown),
  );
  return (
    <Demo
      sequence={seq}
      caption="Two distinctly-typed steps (lineup → crown). The top item flies across into the winner slot — a cross-container move only layoutId can bridge, even across different step types."
    />
  );
}
