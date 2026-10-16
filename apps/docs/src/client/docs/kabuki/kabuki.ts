import type { Written } from '../../../shared/index.ts';
import { page } from '../page.ts';
import type { Page } from '../page.ts';
import * as openingAnApp from './examples/opening-an-app/opening-an-app.mdx';
import * as routingTour from './examples/routing-tour/routing-tour.mdx';
import * as introduction from './get-started/introduction/introduction.mdx';
import * as quickStart from './get-started/quick-start/quick-start.mdx';

/*
 * Every written page of kabuki's docs, by slug. A page the table of contents
 * does not mark `soon` must be here, or this does not compile.
 */

export const KABUKI: Record<Written, Page> = {
  introduction: page(introduction),
  'quick-start': page(quickStart),
  'opening-an-app': page(openingAnApp),
  'routing-tour': page(routingTour),
};
