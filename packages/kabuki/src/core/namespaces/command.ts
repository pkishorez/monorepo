import { Command as Commands } from '../actor/index.ts';

/*
 * `Command`: an errand an Update asks for, made once with `make`.
 */

/** A Command from its name, the Schema of its args and the Effect it runs: what an Update calls with the args. */
export const make = Commands.make;

export type { CommandType as Command } from '../actor/index.ts';
