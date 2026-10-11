import { Composition, registerRoot } from 'remotion';
import { laymos } from './explainers/laymos/index.ts';
import { effectOak } from './walkthroughs/effect-oak/index.ts';

// Every Explainer and every Walkthrough, playable in Remotion Studio and
// renderable by id.
const explainers = [laymos];
const walkthroughs = [effectOak];

function Root() {
  return (
    <>
      {explainers.map(({ id, component, ...video }) => (
        <Composition key={id} id={id} component={component} {...video} />
      ))}
      {walkthroughs.map(({ id, component, ...video }) => (
        <Composition key={id} id={id} component={component} {...video} />
      ))}
    </>
  );
}

registerRoot(Root);
