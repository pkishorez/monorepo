import { Page } from '@kestack/kabuki/routing';
import { AddProjectLive } from '../add-project/index.ts';
import { Projects } from '../ai/index.ts';

/*
 * The home page: every project to pick from, and the form that adds a
 * folder as one, the only thing to do while there are none.
 */

export const Home = Page.define({
  path: '/',
  metadata: { title: 'Projects · AI' },
});

export const HomeLive = Page.build(Home, {
  children: {
    projects: { actor: Projects, props: () => ({}) },
    addProject: { actor: AddProjectLive },
  },
});
