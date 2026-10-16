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
};
