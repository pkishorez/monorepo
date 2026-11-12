import { View } from '@kestack/kabuki/react';
import { TrailLive } from './actor.ts';
import { Trail, pickOf } from './ui/trail.tsx';

/* The Trail drawn: one Instance's moments, each a way back out to the whole tree at its Step. */

export const TrailView = View.make(TrailLive, ({ model, props, send }) => (
  <Trail
    instance={model.instance}
    trail={model.trail}
    problem={model.problem}
    at={props.at}
    onPick={(moment) => send({ _tag: 'Picked', ...pickOf(moment) })}
    onClose={() => send({ _tag: 'Closed' })}
  />
));
