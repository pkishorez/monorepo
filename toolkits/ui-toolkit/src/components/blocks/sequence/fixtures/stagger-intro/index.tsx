import { useSteps } from '../../index';
import { Demo, frames } from '../shared';

import { introScene } from './scene';

/**
 * stagger-intro demo: one render, three frames. Boxes enter staggered; the last
 * frame pulses them with a gentle float.
 */
export function StaggerIntro() {
  const seq = useSteps(
    ...frames(introScene, [
      { title: 'A sequence is just steps', boxes: 0, pulse: false },
      { title: 'Each step renders JSX', boxes: 5, pulse: false },
      { title: 'motion animates the rest', boxes: 5, pulse: true },
    ]),
  );
  return (
    <Demo
      sequence={seq}
      caption="One render, three frames. Boxes enter staggered; the last frame pulses them with a gentle float."
    />
  );
}
