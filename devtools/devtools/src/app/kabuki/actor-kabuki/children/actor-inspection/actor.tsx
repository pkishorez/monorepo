import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import {
  Inspector,
  InspectorView,
  KabukiSession,
} from '@kestack/devtools-kabuki/devtools';
import { kabukiSessionLayer } from './capabilities/kabuki-session/real/index.js';
import { Story, StoryView } from './children/actor-story/index.js';
import { InspectionShape, storyShown } from './logic/shared/index.js';
import { Body } from './view/index.js';

export const Inspection = InspectionShape.build({
  init: ({ name, app }) => ({ model: { name, app } }),
  provides: { capabilities: [KabukiSession], layer: kabukiSessionLayer },
  children: {
    inspector: Actor.child(Inspector, {
      input: () => ({ presenting: false, place: 'bottom' as const }),
    }),
    story: Actor.child(Story, {
      input: ({ model }) => ({ app: model.app }),
      props: (data) => ({ shown: storyShown(data) }),
    }),
  },
});

export const InspectionView = View.make(Inspection, (self) => (
  <Body
    {...self}
    inspector={<InspectorView instance={self.children.inspector} />}
    story={<StoryView instance={self.children.story} />}
  />
));
