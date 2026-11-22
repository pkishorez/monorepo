import { Page } from '@kestack/kabuki/routing';
import { HomePage, HomePageLive } from './pages/home.js';
import { KabukiPage, KabukiPageLive } from './pages/kabuki.js';
import { LotelPage, LotelPageLive } from './pages/lotel.js';
import { MonoversePage, MonoversePageLive } from './pages/monoverse.js';

/*
 * DevTools: the root page, one place per Tool in the URL (`pages/`), and
 * the list of Tools at `/`. Each Tool is its own Actor, mounted as a Child
 * of its page; the root only draws the frame around them (`view.tsx`).
 */

export const DevTools = Page.define({
  pages: {
    Home: HomePage,
    Lotel: LotelPage,
    Monoverse: MonoversePage,
    Kabuki: KabukiPage,
  },
});

export const DevToolsLive = DevTools.build({
  pages: {
    Home: HomePageLive,
    Lotel: LotelPageLive,
    Monoverse: MonoversePageLive,
    Kabuki: KabukiPageLive,
  },
});
