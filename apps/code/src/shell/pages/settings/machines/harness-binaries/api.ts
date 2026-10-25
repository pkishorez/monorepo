import { CodeClient, CodeClients } from '@kestack/connect/code';
import { orRefused } from '../../../../machines/index.ts';

/*
 * What a Machine's Harness Binaries ask of it, over its own socket.
 */

/** Every agent's Harness Binary on a Machine, as a Message; a Worker reads it. */
export const loadBinaries = (machineId: string) =>
  orRefused(
    CodeClients.on(
      machineId,
      CodeClient.use((api) => api.harnessBinaries()),
    ),
    (binaries) => ({ _tag: 'BinariesLoaded' as const, binaries }),
  );
