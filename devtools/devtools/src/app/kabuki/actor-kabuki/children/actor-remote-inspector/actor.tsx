import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import {
  Inspector,
  InspectorView,
  KabukiSession,
} from '@kestack/devtools-kabuki/devtools';
import { kabukiSessionLayer } from './capabilities/kabuki-session/real/index.js';
import { RemoteInspectorShape } from './logic/shared/index.js';
import { Body } from './view/index.js';

export const RemoteInspector = RemoteInspectorShape.build({
  init: ({ name }) => ({ model: { name } }),
  provides: { capabilities: [KabukiSession], layer: kabukiSessionLayer },
  children: {
    inspector: Actor.child(Inspector, {
      input: () => ({ presenting: false, place: 'bottom' as const }),
    }),
  },
});

export const RemoteInspectorView = View.make(RemoteInspector, (self) => (
  <Body
    {...self}
    inspector={<InspectorView instance={self.children.inspector} />}
  />
));
