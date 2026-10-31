import { Page } from '@kestack/kabuki/routing';
import { NAME } from '../content/index.ts';
import { Home, HomeLive } from './home.ts';
import { Kabuki, KabukiLive } from './kabuki/index.ts';

/** The root page: no path and no data, every toolkit's place under it. */
export const App = Page.define({
  metadata: { meta: [{ property: 'og:site_name', content: NAME }] },
  pages: { Home, Kabuki },
});

export const AppLive = App.build({
  pages: { Home: HomeLive, Kabuki: KabukiLive },
});
