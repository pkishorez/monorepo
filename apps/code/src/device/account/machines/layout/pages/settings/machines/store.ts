import { Context, type Effect } from 'effect';

/*
 * What a Machine's card tells Settings → Machines, as the list Provides it
 * to its cards.
 */
export class MachineCards extends Context.Service<
  MachineCards,
  {
    /** Forget was asked for the Machine `id`: the list asks first. */
    readonly forget: (id: string) => Effect.Effect<void>;
  }
>()('code/MachineCards') {}
