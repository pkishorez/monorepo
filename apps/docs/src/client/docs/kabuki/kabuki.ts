import type { KabukiSlug as Slug } from '../../../shared/index.ts';
import { page } from '../page.ts';
import type { Page } from '../page.ts';
import introduction, {
  headings as introductionHeadings,
} from './get-started/introduction/introduction.mdx';
import quickStart, {
  headings as quickStartHeadings,
} from './get-started/quick-start/quick-start.mdx';
import actor, { headings as actorHeadings } from './core/actor/actor.mdx';
import stateMachine, {
  headings as stateMachineHeadings,
} from './core/state-machine/state-machine.mdx';
import workers, {
  headings as workersHeadings,
} from './core/workers/workers.mdx';
import children, {
  headings as childrenHeadings,
} from './core/children/children.mdx';
import props, { headings as propsHeadings } from './core/props/props.mdx';
import capabilities, {
  headings as capabilitiesHeadings,
} from './core/capabilities/capabilities.mdx';
import view, { headings as viewHeadings } from './react/view/view.mdx';
import history, {
  headings as historyHeadings,
} from './core/history/history.mdx';
import app, { headings as appHeadings } from './react/app/app.mdx';
import pages, { headings as pagesHeadings } from './routing/pages/pages.mdx';
import moving, {
  headings as movingHeadings,
} from './routing/moving/moving.mdx';
import data, { headings as dataHeadings } from './routing/data/data.mdx';
import serving, {
  headings as servingHeadings,
} from './start/serving/serving.mdx';
import yourApp, {
  headings as yourAppHeadings,
} from './start/your-app/your-app.mdx';
import platforms, {
  headings as platformsHeadings,
} from './start/platforms/platforms.mdx';
import counter, {
  headings as counterHeadings,
} from './demos/counter/counter.mdx';
import counters, {
  headings as countersHeadings,
} from './demos/counters/counters.mdx';
import stopwatch, {
  headings as stopwatchHeadings,
} from './demos/stopwatch/stopwatch.mdx';
import todos, { headings as todosHeadings } from './demos/todos/todos.mdx';
import checkout, {
  headings as checkoutHeadings,
} from './demos/checkout/checkout.mdx';
import managedResource, {
  headings as managedResourceHeadings,
} from './demos/managed-resource/managed-resource.mdx';
import shoppingCart, {
  headings as shoppingCartHeadings,
} from './demos/shopping-cart/shopping-cart.mdx';
import snake, { headings as snakeHeadings } from './demos/snake/snake.mdx';
import openingAnApp, {
  headings as openingAnAppHeadings,
} from './demos/opening-an-app/opening-an-app.mdx';

/*
 * Every page of kabuki's docs, by slug. Every page in the table of contents
 * must be here, or this does not compile.
 */

export const KABUKI: Record<Slug, Page> = {
  introduction: page(introduction, introductionHeadings),
  'quick-start': page(quickStart, quickStartHeadings),
  actor: page(actor, actorHeadings),
  'state-machine': page(stateMachine, stateMachineHeadings),
  workers: page(workers, workersHeadings),
  children: page(children, childrenHeadings),
  props: page(props, propsHeadings),
  capabilities: page(capabilities, capabilitiesHeadings),
  history: page(history, historyHeadings),
  view: page(view, viewHeadings),
  app: page(app, appHeadings),
  pages: page(pages, pagesHeadings),
  moving: page(moving, movingHeadings),
  data: page(data, dataHeadings),
  serving: page(serving, servingHeadings),
  'your-app': page(yourApp, yourAppHeadings),
  platforms: page(platforms, platformsHeadings),
  counter: page(counter, counterHeadings),
  counters: page(counters, countersHeadings),
  stopwatch: page(stopwatch, stopwatchHeadings),
  todos: page(todos, todosHeadings),
  checkout: page(checkout, checkoutHeadings),
  'managed-resource': page(managedResource, managedResourceHeadings),
  'shopping-cart': page(shoppingCart, shoppingCartHeadings),
  snake: page(snake, snakeHeadings),
  'opening-an-app': page(openingAnApp, openingAnAppHeadings),
};
