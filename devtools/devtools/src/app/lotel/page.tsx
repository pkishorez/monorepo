import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Page } from '@kestack/kabuki/routing';
import { Lotel, LotelView } from './actor-lotel/index.js';

export const LotelPage = Page.define({ path: '/lotel' });

export const LotelPageLive = LotelPage.build({
  children: { tool: Actor.child(Lotel, { input: () => ({}) }) },
});

export const LotelPageView = View.make(LotelPageLive, ({ children }) => (
  <LotelView instance={children.tool} />
));
