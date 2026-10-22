import { Clock, Effect } from 'effect';
import { Actor } from '@kestack/kabuki';
import { nextUlid } from '@kestack/std-toolkit/core';
import { SessionAgent } from '../agent/index.js';

/*
 * Lives while its Session is idle and waits for the agent to start a Turn
 * on its own; then tells the Session to run it. A Turn the agent starts
 * while another runs waits until the Session is idle again.
 */

export const AgentTurns = Actor.build(
  Actor.define('AgentTurns', { requires: [SessionAgent] }),
  {
    workers: {
      wait: {
        run: () =>
          Effect.gen(function* () {
            const context = yield* SessionAgent;
            yield* context.nextAgentTurn;
            yield* context.report({
              _tag: 'AgentTurn',
              turnId: yield* nextUlid,
              at: yield* Clock.currentTimeMillis,
            });
          }),
      },
    },
  },
);
