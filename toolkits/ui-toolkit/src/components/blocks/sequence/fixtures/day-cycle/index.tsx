import { useSteps } from '../../index';
import { Demo, frames } from '../shared';

import { SKIES } from './model';
import { dayScene } from './scene';

export function DayCycle() {
  const seq = useSteps(...frames(dayScene, SKIES));
  return (
    <Demo
      sequence={seq}
      caption="A day in one breath. A single circle crosses the sky as the background light and a one-word caption shift from dawn to night; stars fade in last."
    />
  );
}
