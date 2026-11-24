import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Page } from '@kestack/kabuki/routing';
import { Lotel, LotelView } from '../lotel/actor-lotel/index.js';

/*
 * `/lotel`: the Lotel Tool, as it is. Its Traces and Logs keep nothing in
 * the URL, so the page only holds it.
 */

export const LotelPage = Page.define({ path: '/lotel' });

export const LotelPageLive = LotelPage.build({
  children: { tool: Actor.child(Lotel, { input: () => ({}) }) },
});

export const LotelPageView = View.make(LotelPageLive, ({ children }) => (
  <LotelView instance={children.tool} />
));
