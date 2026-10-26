import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Kept, KitParts, shelf } from '../../../../layer/capabilities/index.ts';

/*
 * What a Machine Kit keeps on this device of what its Machine said.
 */

/** A Machine Kit as kept, for its Account and Machine. */
export const KitShelf = shelf('machine-kit', 1, KitParts);

/** Keeps what the Machine said, the models it could not list left out; a write that fails is lost. */
export const keepKit = Command.make('KeepKit', {
  args: Schema.Struct({
    accountId: Schema.String,
    machineId: Schema.String,
    parts: KitParts,
  }),
  run: ({ accountId, machineId, parts }) =>
    Effect.flatMap(Kept, (kept) =>
      kept.write(
        KitShelf,
        { accountId, machineId, projectId: null },
        {
          ...parts,
          models: parts.models.filter(({ problem }) => problem === null),
        },
      ),
    ),
});
