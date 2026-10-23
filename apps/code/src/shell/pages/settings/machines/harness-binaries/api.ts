import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { orRefused } from '../../../../refusal/index.ts';

/*
 * What a Machine's Harness Binaries ask of it, over its own socket.
 */

/** Every agent's Harness Binary on a Machine, as a Message; a Worker reads it. */
export const loadBinaries = (machineId: string) =>
  orRefused(
    AiClients.on(
      machineId,
      AiClient.use((api) => api.harnessBinaries()),
    ),
    (binaries) => ({ _tag: 'BinariesLoaded' as const, binaries }),
  );
