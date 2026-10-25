import { CodeClient, CodeClients } from '@kestack/connect/code';
import { orRefused } from '../../../../machines/index.ts';

/*
 * What a Machine's Harness Accounts ask of it, over its own socket.
 */

/**
 * Every Harness Account on a Machine, as a Message saying how many changes
 * had been made when it was asked; a Worker reads it.
 */
export const loadAccounts = (machineId: string, since: number) =>
  orRefused(
    CodeClients.on(
      machineId,
      CodeClient.use((api) => api.harnessAccounts()),
    ),
    (accounts) => ({ _tag: 'AccountsLoaded' as const, accounts, since }),
  );
