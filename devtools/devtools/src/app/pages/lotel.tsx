import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Page } from '@kestack/kabuki/routing';
import { LotelLive, LotelView } from '../lotel/index.js';

/*
 * `/lotel`: the Lotel Tool, as it is. Its Traces and Logs keep nothing in
 * the URL, so the page only holds it.
 */

export const LotelPage = Page.define({ path: '/lotel' });

export const LotelPageLive = LotelPage.build({
  children: { tool: Actor.child(LotelLive, { input: () => ({}) }) },
});

export const LotelPageView = View.make(LotelPageLive, ({ children }) => (
  <LotelView instance={children.tool} />
));
