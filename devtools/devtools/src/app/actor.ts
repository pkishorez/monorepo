import { Page } from '@kestack/kabuki/routing';
import { HomePage, HomePageLive } from './home.js';
import { KabukiPage, KabukiPageLive } from './kabuki/page.js';
import { LotelPage, LotelPageLive } from './lotel/page.js';
import { MonoversePage, MonoversePageLive } from './monoverse/page.js';

/*
 * DevTools: the root page, one place per Tool in the URL (each Tool's
 * `page.tsx`), and the list of Tools at `/` (`home.ts`). Each Tool is its own Actor, mounted as a Child
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
