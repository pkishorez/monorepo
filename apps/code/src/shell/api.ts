import { Schema } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Command } from '@kestack/kabuki';
import { orRefused } from '../refusal/index.ts';

/*
 * What the root page asks of the server for its sidebar: Un-settle a
 * Session from the Settled List.
 */

export const unsettle = Command.make('Unsettle', {
  args: Schema.Struct({ sessionId: Schema.String }),
  run: (args) =>
    orRefused(
      AiClient.use((api) => api.unsettleSession(args)),
      () => ({ _tag: 'Unsettled' as const, sessionId: args.sessionId }),
    ),
});
