import { Page } from '@kestack/kabuki/routing';

/*
 * `/`: DevTools' own page, the list of Tools. It does nothing, so the root
 * draws it (`../view.tsx`).
 */

export const HomePage = Page.define({ path: '/' });

export const HomePageLive = HomePage.build();
