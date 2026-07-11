import { SliceViz } from '../dashboard-kit';
import type { CalmStrategyVizProps } from './types';

export function CalmStrategyViz({
  strategyState,
  partition,
  hideCaption,
  className,
}: CalmStrategyVizProps) {
  return (
    <SliceViz
      strategyState={strategyState}
      totalItems={partition.itemCount}
      active={partition.activity === 'active'}
      hideCaption={hideCaption}
      className={className ?? 'w-full'}
    />
  );
}
