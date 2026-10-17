import type { Slug } from '../../../shared/index.ts';
import { page } from '../page.ts';
import type { Page } from '../page.ts';
import * as introduction from './get-started/introduction/introduction.mdx';
import * as quickStart from './get-started/quick-start/quick-start.mdx';
import * as actor from './primitives/actor/actor.mdx';
import * as stateMachine from './primitives/state-machine/state-machine.mdx';
import * as workers from './primitives/workers/workers.mdx';
import * as children from './primitives/children/children.mdx';
import * as props from './primitives/props/props.mdx';
import * as capabilities from './primitives/capabilities/capabilities.mdx';
import * as view from './primitives/view/view.mdx';
import * as history from './primitives/history/history.mdx';
import * as counter from './demos/counter/counter.mdx';
import * as counters from './demos/counters/counters.mdx';
import * as stopwatch from './demos/stopwatch/stopwatch.mdx';
import * as todos from './demos/todos/todos.mdx';
import * as checkout from './demos/checkout/checkout.mdx';
import * as managedResource from './demos/managed-resource/managed-resource.mdx';
import * as shoppingCart from './demos/shopping-cart/shopping-cart.mdx';

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
  view: page(view),
  history: page(history),
  counter: page(counter),
  counters: page(counters),
  stopwatch: page(stopwatch),
  todos: page(todos),
  checkout: page(checkout),
  'managed-resource': page(managedResource),
  'shopping-cart': page(shoppingCart),
};
