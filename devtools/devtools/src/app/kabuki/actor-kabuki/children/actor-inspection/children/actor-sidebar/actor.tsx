import { Actor } from '@kestack/kabuki';
import { View, useChild } from '@kestack/kabuki/react';
import { World, WorldView, hasFakes } from '@kestack/devtools-kabuki/devtools';
import { Chat, ChatView } from './children/actor-chat/index.js';
import { SidebarShape, init, updates } from './logic/index.js';
import { Body } from './view/index.js';

export const Sidebar = SidebarShape.build({
  init,
  on: updates,
  children: {
    world: Actor.child(World),
    chat: Actor.child(Chat, {
      input: ({ model }) => ({ name: model.name, app: model.app }),
    }),
  },
});

export const SidebarView = View.make(Sidebar, (self) => (
  <Body
    {...self}
    world={<WorldView instance={self.children.world} />}
    chat={<ChatView instance={self.children.chat} />}
    fakes={useChild(self.children.world, hasFakes) === true}
  />
));
