import { Page } from '@kestack/kabuki/routing';
import { NAME } from '../content/index.ts';
import { Home, HomeLive } from './home.ts';
import { Kabuki, KabukiLive } from './kabuki/index.ts';
import { StdToolkit, StdToolkitLive } from './std-toolkit/index.ts';

/** The root page: no path and no data, every package's place under it. */
export const App = Page.define({
  metadata: { meta: [{ property: 'og:site_name', content: NAME }] },
  pages: { Home, Kabuki, StdToolkit },
});

export const AppLive = App.build({
  pages: { Home: HomeLive, Kabuki: KabukiLive, StdToolkit: StdToolkitLive },
});
