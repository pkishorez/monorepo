import { Context } from 'effect';
import type { Effect } from 'effect';
import type {
  HarnessAccountInfo,
  Machine as MachineSchema,
  SpeechToTextState,
} from '@kestack/connect/code';
import type { Gone } from './gone.ts';

/*
 * The last list of Machines each Account was given on this device, so the
 * app opens on its Machines even while Cloud Connect is out of reach, and
 * each Machine's settings as it last said them, so Settings shows them at
 * once and asks the Machine behind. Nothing here is the truth: Cloud
 * Connect's next answer, and the Machine's, replace it. The app Layer
 * gives it, from `services/saved-machines.ts`.
 */

type Machine = typeof MachineSchema.Type;

/** A Machine's settings as it last said them; each null until it has. */
export interface SavedSettings {
  readonly accounts: ReadonlyArray<HarnessAccountInfo> | null;
  readonly speech: SpeechToTextState | null;
}

/** What a Machine never heard from on this device reads as. */
export const noSettings: SavedSettings = { accounts: null, speech: null };

/** The Capability that keeps each Account's last list, and each of its Machines' settings. */
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
    /** One of the Account's Machines' settings, as last kept. */
    readonly settings: (
      accountId: string,
      machineId: string,
    ) => Effect.Effect<SavedSettings>;
    /** Keeps the parts given of one Machine's settings, the rest as they were. */
    readonly keepSettings: (
      accountId: string,
      machineId: string,
      settings: Partial<SavedSettings>,
    ) => Effect.Effect<void>;
    /** Deletes the settings of every Machine that went; a Project is none of its. */
    readonly drop: (gone: Gone) => Effect.Effect<void>;
  }
>()('code/SavedMachines') {}
