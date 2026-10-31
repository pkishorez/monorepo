import { Page } from '@kestack/kabuki/routing';
import { about } from '../content/index.ts';

/** The stack's home: what it is, and the way into each toolkit. */
export const Home = Page.define({
  path: '/',
  metadata: about('/', 'Home', 'Everything I build, in one monorepo.'),
});

export const HomeLive = Home.build();
