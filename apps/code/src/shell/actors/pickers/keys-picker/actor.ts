import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { keysIn, keyTable, labelOf, type KeyRow } from '../../../../keys.ts';
import * as Picker from '../../../../ui/picker/index.ts';

/*
 * The Keys Picker: the Actions that work where the user is, each with its
 * keys out of Vim Mode and in it.
 *
 * 1. List    opened with the Actions that worked where the user was, and
 *            whether Vim Mode was on: one row per Action, by the key
 *            table's sections, its keys under the user's Bindings, the set
 *            in effect lit. A key table row of several Actions is one row
 *            each, its keys in either Mode paired where they line up. The
 *            Keys Picker itself is not listed.
 * 2. Run     the row chosen is kept as the Picker closes, so the View
 *            runs its Action once the keyboard is back where the user was,
 *            as its keys would there.
 */

type Id = KeyRow['always'][number];

/** One Action as the Keys Picker lists it: its keys in either Mode. */
interface Listed {
  readonly section: string;
  readonly label: string;
  readonly out: Id | null;
  readonly vim: Id | null;
}

/** The Actions that open the Keys Picker, which it never lists. */
const OWN: ReadonlySet<string> = new Set(['app.help', 'app.helpAnywhere']);

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

const Bindings = Schema.Record(Schema.String, Schema.Array(Schema.String));

const Listing = Schema.Struct({
  bindings: Bindings,
  /** The Actions that worked where it was opened, by id. */
  available: Schema.Array(Schema.String),
  vim: Schema.Boolean,
});
type Listing = typeof Listing.Type;

/** The rows, as the Step lists them: each runs the Action that worked. */
export const rowsOf = ({ bindings, available, vim }: Listing) => {
  const works = new Set(available);
  return listed.flatMap(({ section, label, out, vim: plain }) => {
    const run = [out, plain].find(
      (id): id is Id => id !== null && works.has(id) && !OWN.has(id),
    );
    return run === undefined
      ? []
      : [
          {
            value: run,
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

const Keys = Picker.make('KeysPicker', {
  props: Listing,
  steps: {
    action: {
      placeholder: () => 'Search by name or key',
      empty: () => 'No key by that name',
      rows: ({ props }) => ({ rows: rowsOf(props) }),
    },
  },
});

export const KeysPicker = Actor.define('KeysPicker', {
  props: Schema.Struct({ bindings: Bindings }),
  model: Schema.Struct({
    picking: Schema.NullOr(Picker.How),
    opened: Schema.Finite,
    available: Schema.Array(Schema.String),
    vim: Schema.Boolean,
    /** The Action chosen, to run once the Picker is closed. */
    chosen: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Open: {
      how: Picker.How,
      available: Schema.Array(Schema.String),
      vim: Schema.Boolean,
    },
    Closed: {},
    Chose: { id: Schema.String },
    /** The Action chosen was run. */
    Ran: {},
  }),
});

export const KeysPickerLive = Actor.build(KeysPicker, {
  init: () => ({
    model: {
      picking: null,
      opened: 0,
      available: [],
      vim: false,
      chosen: null,
    },
  }),
  children: {
    picker: {
      actor: Keys.Live,
      while: ({ model }) => model.picking !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) => ({
        how: model.picking ?? 'keys',
        step: { id: 'action', key: '' },
        choices: [],
      }),
      props: ({ model, props }) => ({
        bindings: props.bindings,
        available: model.available,
        vim: model.vim,
      }),
    },
  },
  provides: (self) =>
    Keys.owner({
      done: (choices) => {
        const chosen = choices?.at(-1)?.value;
        return self.send(
          chosen === undefined
            ? { _tag: 'Closed' }
            : { _tag: 'Chose', id: chosen },
        );
      },
    }),
  on: {
    // 1. List
    Open: ({ how, available, vim }, { model }) =>
      model.picking !== null
        ? {}
        : {
            model: {
              picking: how,
              opened: model.opened + 1,
              available,
              vim,
              chosen: null,
            },
          },
    Closed: (_, { model }) => ({ model: { ...model, picking: null } }),
    // 2. Run
    Chose: ({ id }, { model }) => ({
      model: { ...model, picking: null, chosen: id },
    }),
    Ran: (_, { model }) => ({ model: { ...model, chosen: null } }),
  },
});

export const KeysView = Keys.View;
