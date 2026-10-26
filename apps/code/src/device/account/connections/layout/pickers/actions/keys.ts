import { keysIn, keyTable, labelOf, type KeyRow } from '../../commands.ts';

/*
 * Every Action of the keyboard as the Actions list shows it: the ones that
 * work where the user is, each with its keys out of Vim Mode and in it.
 *
 * 1. List    one row per Action, by the key table's sections, its keys
 *            under the user's Bindings, the set in effect lit. A key table
 *            row of several Actions is one row each, its keys in either
 *            Mode paired where they line up. The Actions that open the
 *            list are not listed.
 * 2. Run     a row's value is the Action it runs: the one that worked
 *            where the list was opened, as its keys would there.
 */

type Id = KeyRow['always'][number];

/** One Action as the list shows it: its keys in either Mode. */
interface Listed {
  readonly section: string;
  readonly label: string;
  readonly out: Id | null;
  readonly vim: Id | null;
}

/** The Actions that open the list, which it never lists. */
const OWN: ReadonlySet<string> = new Set([
  'app.help',
  'app.helpAnywhere',
  'app.actions',
  'app.actionsAnywhere',
]);

/** 1. List: a key table row as one row per Action. */
const split = (section: string, row: KeyRow): ReadonlyArray<Listed> => {
  const { always, vim } = row;
  if (always.length <= 1 && vim.length <= 1)
    return [
      {
        section,
        label: row.label,
        out: always[0] ?? null,
        vim: vim[0] ?? null,
      },
    ];
  if (always.length === vim.length)
    return vim.map((id, at) => ({
      section,
      label: labelOf(id),
      out: always[at] ?? null,
      vim: id,
    }));
  return [
    ...always.map((id) => ({
      section,
      label: labelOf(id),
      out: id,
      vim: null,
    })),
    ...vim.map((id) => ({ section, label: labelOf(id), out: null, vim: id })),
  ];
};

const listed = keyTable.flatMap(({ title, rows }) =>
  rows.flatMap((row) => split(title, row)),
);

/** Whether a row's value is an Action of the keyboard: its id names its Surface. */
export const isKey = (value: string) => value.includes('.');

/** 2. Run: the rows, each running the Action that worked where it was opened. */
export const rowsOf = ({
  bindings,
  available,
  vim,
}: {
  readonly bindings: Readonly<Record<string, ReadonlyArray<string>>>;
  /** The Actions that worked where it was opened, by id. */
  readonly available: ReadonlyArray<string>;
  /** Whether Vim Mode was on. */
  readonly vim: boolean;
}) => {
  const works = new Set(available);
  return listed.flatMap(({ section, label, out, vim: plain }) => {
    const run = [out, plain].find(
      (id): id is Id => id !== null && works.has(id) && !OWN.has(id),
    );
    return run === undefined
      ? []
      : [
          {
            value: run as string,
            label,
            group: section,
            keys: {
              out: out === null ? [] : keysIn(bindings, out),
              vim: plain === null ? [] : keysIn(bindings, plain),
              on: vim ? ('vim' as const) : ('out' as const),
            },
          },
        ];
  });
};
