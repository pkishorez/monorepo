import { Page } from '@kestack/kabuki/routing';
import { Projects } from '../../../replica/index.ts';

/*
 * The home page: every project to pick from, and the way to the Project
 * Picker, the only thing to do while there are none.
 */

export const Home = Page.define({
  path: '/',
  metadata: { title: 'Projects · code' },
});

export const HomeLive = Page.build(Home, {
  children: {
    projects: { actor: Projects, props: () => ({}) },
  },
});
