import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Instance, InstanceView } from './children/actor-instance/index.ts';
import {
  InspectorShape,
  init,
  instanceOf,
  openedOf,
  updates,
  workers,
} from './logic/index.ts';
import { Body } from './view/index.ts';

export const Inspector = InspectorShape.build({
  init,
  on: updates,
  workers,
  children: {
    instance: Actor.child(Instance, {
      each: openedOf,
      input: (_, address) => ({ address }),
      props: instanceOf,
      emits: {
        NowAsked: () => ({ _tag: 'Picked', step: null }),
        Closed: () => ({ _tag: 'Opened', address: null }),
      },
    }),
  },
});

export const InspectorView = View.make(Inspector, (self) => (
  <Body
    {...self}
    instance={self.children.instance.map((one) => (
      <InstanceView key={one.key} instance={one} />
    ))}
  />
));
