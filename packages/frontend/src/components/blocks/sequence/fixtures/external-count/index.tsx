import { useSteps } from '../../index';
import { Demo, frames } from '../shared';
import { dots } from './scene';

/**
 * external-count — props-injected count + collapse to a stack. The dot count is
 * injected via each frame's props; new dots scale in, and the final frame
 * collapses every dot into one stack via `layoutId`.
 */
export function ExternalCount() {
  const seq = useSteps(
    ...frames<{ count: number; mode: 'grid' | 'stack' }>(dots, [
      { count: 3, mode: 'grid' },
      { count: 7, mode: 'grid' },
      { count: 7, mode: 'stack' },
    ]),
  );
  return (
    <Demo
      sequence={seq}
      caption="The dot count is injected via each frame's props; new dots scale in, and the final frame collapses every dot into one stack via layoutId."
    />
  );
}
