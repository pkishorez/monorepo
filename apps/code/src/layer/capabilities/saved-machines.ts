import { Context } from 'effect';
import type { Effect } from 'effect';
import type { Machine as MachineSchema } from '@kestack/ai-toolkit/machines';

/*
 * The last list of Machines each Account was given on this device, so the
 * app opens on its Machines even while the Backend is out of reach.
 * Nothing here is the truth: the Backend's next answer replaces it. The
 * app Layer gives it, from `services/saved-machines.ts`.
 */

type Machine = typeof MachineSchema.Type;

/** The Capability that keeps each Account's last list. */
export class SavedMachines extends Context.Service<
  SavedMachines,
  {
    /** The list last kept for the Account; null if none was. */
    readonly read: (
      accountId: string,
    ) => Effect.Effect<ReadonlyArray<Machine> | null>;
    readonly write: (
      accountId: string,
      machines: ReadonlyArray<Machine>,
    ) => Effect.Effect<void>;
  }
>()('code/SavedMachines') {}
