import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import {
  RemoteInspector,
  RemoteInspectorView,
} from './children/actor-remote-inspector/index.js';
import {
  KabukiShape,
  init,
  inspectorKey,
  updates,
  workers,
} from './logic/index.js';
import { Body } from './view/index.js';

export const Kabuki = KabukiShape.build({
  init,
  on: updates,
  workers,
  states: {
    Inspection: {
      children: {
        inspector: Actor.child(RemoteInspector, {
          key: inspectorKey,
          input: ({ state }) => ({ name: state.name }),
        }),
      },
    },
  },
});

export const KabukiView = View.make(Kabuki, (self) => (
  <Body
    {...self}
    inspector={
      self._tag === 'Inspection' ? (
        <RemoteInspectorView
          key={self.state.name}
          instance={self.children.inspector}
        />
      ) : null
    }
  />
));
