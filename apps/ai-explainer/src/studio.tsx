import { Composition, registerRoot } from 'remotion';
import { laymos } from './explainers/laymos/index.ts';

// Every Explainer, playable in Remotion Studio and renderable by id.
const explainers = [laymos];

function Root() {
  return explainers.map(({ id, component, ...video }) => (
    <Composition key={id} id={id} component={component} {...video} />
  ));
}

registerRoot(Root);
