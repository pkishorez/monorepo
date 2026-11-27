import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import {
  Inspection,
  InspectionView,
} from './children/actor-inspection/index.js';
import {
  KabukiShape,
  appOf,
  init,
  inspectionKey,
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
        inspection: Actor.child(Inspection, {
          key: inspectionKey,
          input: (data) => ({ name: data.state.name, app: appOf(data) }),
          props: ({ model }) => ({ tab: model.tab }),
        }),
      },
    },
  },
});

export const KabukiView = View.make(Kabuki, (self) => (
  <Body
    {...self}
    inspection={
      self._tag === 'Inspection' ? (
        <InspectionView
          key={self.state.name}
          instance={self.children.inspection}
        />
      ) : null
    }
  />
));
