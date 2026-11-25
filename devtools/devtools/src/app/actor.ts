import { Page } from '@kestack/kabuki/routing';
import { HomePage, HomePageLive } from './home.js';
import { KabukiPage, KabukiPageLive } from './kabuki/page.js';
import { LotelPage, LotelPageLive } from './lotel/page.js';
import { MonoversePage, MonoversePageLive } from './monoverse/page.js';

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
