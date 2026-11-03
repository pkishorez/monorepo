import type { Effect } from 'effect';
import type { StdTable, StdTableService } from '@kestack/std-toolkit/db';

/*
 * What a page's Live Table runs: the one table it is about, the buttons
 * the reader presses, and how the app reads the rows back. Every Effect
 * runs against the page's own table in memory, made fresh on every visit.
 */

/** One button: a label, and what pressing it does, given how many times it was pressed before. */
export type Action<Name extends string> = {
  readonly label: string;
  readonly run: (
    pressed: number,
  ) => Effect.Effect<unknown, unknown, StdTableService<Name>>;
};

/** How the app reads the rows back, under a label that says as whom. */
export type Read<Name extends string> = {
  readonly label: string;
  readonly effect: Effect.Effect<
    ReadonlyArray<unknown>,
    unknown,
    StdTableService<Name>
  >;
};

export type Lab<Name extends string = string> = {
  readonly table: StdTable<Name>;
  readonly actions: ReadonlyArray<Action<Name>>;
  readonly read?: Read<Name>;
};

/** A Live Table's lab, its types checked against the one table. */
export const lab = <Name extends string>(options: Lab<Name>): Lab<Name> =>
  options;
