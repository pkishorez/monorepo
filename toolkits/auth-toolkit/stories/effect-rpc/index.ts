import { Story } from 'laymos/story';

import { addingAPermissionRule } from './02-adding-a-permission-rule/adding-a-permission-rule.story.js';
import { handlingCallsTogether } from './04-handling-calls-together/handling-calls-together.story.js';
import { protectingAWholeRpcGroup } from './03-protecting-a-whole-rpc-group/protecting-a-whole-rpc-group.story.js';
import { protectingYourFirstRpc } from './01-protecting-your-first-rpc/protecting-your-first-rpc.story.js';
import { rpcEdgeCases } from './99-rpc-edge-cases/rpc-edge-cases.story.js';

const cases = Story.group(
  'Cases',
  {
    description:
      'Examples of authentication, authorization, group policies, batching, cookies, and failures.',
  },
  [
    protectingYourFirstRpc,
    addingAPermissionRule,
    protectingAWholeRpcGroup,
    handlingCallsTogether,
    rpcEdgeCases,
  ],
);

export const effectRpc = Story.group(
  'Effect RPC',
  {
    description:
      'Require Current Auth, add permission rules, protect groups, and handle batched or concurrent calls.',
  },
  [cases],
);
