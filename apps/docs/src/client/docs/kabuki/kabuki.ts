import type { Slug } from '../../../shared/index.ts';
import { page } from '../page.ts';
import type { Page } from '../page.ts';
import * as introduction from './get-started/introduction/introduction.mdx';
import * as quickStart from './get-started/quick-start/quick-start.mdx';
import * as actor from './core/actor/actor.mdx';
import * as stateMachine from './core/state-machine/state-machine.mdx';
import * as workers from './core/workers/workers.mdx';
import * as children from './core/children/children.mdx';
import * as props from './core/props/props.mdx';
import * as capabilities from './core/capabilities/capabilities.mdx';
import * as view from './react/view/view.mdx';
import * as history from './core/history/history.mdx';
import * as app from './react/app/app.mdx';
import * as pages from './routing/pages/pages.mdx';
import * as moving from './routing/moving/moving.mdx';
import * as data from './routing/data/data.mdx';
import * as serving from './start/serving/serving.mdx';
import * as yourApp from './start/your-app/your-app.mdx';
import * as platforms from './start/platforms/platforms.mdx';
import * as counter from './demos/counter/counter.mdx';
import * as counters from './demos/counters/counters.mdx';
import * as stopwatch from './demos/stopwatch/stopwatch.mdx';
import * as todos from './demos/todos/todos.mdx';
import * as checkout from './demos/checkout/checkout.mdx';
import * as managedResource from './demos/managed-resource/managed-resource.mdx';
import * as shoppingCart from './demos/shopping-cart/shopping-cart.mdx';
import * as snake from './demos/snake/snake.mdx';
import * as openingAnApp from './demos/opening-an-app/opening-an-app.mdx';

/*
 * Every page of kabuki's docs, by slug. Every page in the table of contents
 * must be here, or this does not compile.
 */

export const KABUKI: Record<Slug, Page> = {
  introduction: page(introduction),
  'quick-start': page(quickStart),
  actor: page(actor),
  'state-machine': page(stateMachine),
  workers: page(workers),
  children: page(children),
  props: page(props),
  capabilities: page(capabilities),
  history: page(history),
  view: page(view),
  app: page(app),
  pages: page(pages),
  moving: page(moving),
  data: page(data),
  serving: page(serving),
  'your-app': page(yourApp),
  platforms: page(platforms),
  counter: page(counter),
  counters: page(counters),
  stopwatch: page(stopwatch),
  todos: page(todos),
  checkout: page(checkout),
  'managed-resource': page(managedResource),
  'shopping-cart': page(shoppingCart),
  snake: page(snake),
  'opening-an-app': page(openingAnApp),
};
