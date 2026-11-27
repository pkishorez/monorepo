import { Actor } from '@kestack/kabuki';
import { View, useChildren } from '@kestack/kabuki/react';
import { Instance, InstanceView } from './children/actor-instance/index.ts';
import { World, WorldView, hasFakes } from './children/actor-world/index.ts';
import {
  InspectorShape,
  init,
  instanceOf,
  openedOf,
  updates,
  workers,
  worldOf,
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
    world: Actor.child(World, { each: worldOf }),
  },
});

export const InspectorView = View.make(Inspector, (self) => (
  <Body
    {...self}
    instance={self.children.instance.map((one) => (
      <InstanceView key={one.key} instance={one} />
    ))}
    world={self.children.world.map((one) => (
      <WorldView key={one.key} instance={one} />
    ))}
    fakes={useChildren(self.children.world, hasFakes).includes(true)}
  />
));
