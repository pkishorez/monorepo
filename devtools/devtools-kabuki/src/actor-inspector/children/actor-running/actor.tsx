import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Instance, InstanceView } from './children/actor-instance/index.ts';
import {
  RunningShape,
  init,
  instanceOf,
  openedOf,
  updates,
  workers,
} from './logic/index.ts';
import { Body } from './view/index.ts';

export const Running = RunningShape.build({
  init,
  on: updates,
  workers,
  children: {
    instance: Actor.child(Instance, {
      each: openedOf,
      input: (_, address) => ({ address }),
      props: instanceOf,
      emits: { NowAsked: () => ({ _tag: 'Picked', step: null }) },
    }),
  },
});

export const RunningView = View.make(Running, (self) => (
  <Body
    {...self}
    instances={
      new Map(
        self.children.instance.map((one) => [
          one.key,
          <InstanceView key={one.address} instance={one} />,
        ]),
      )
    }
  />
));
