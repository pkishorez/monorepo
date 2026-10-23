import { Context, Effect, Layer, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { rank, type Ranked } from './rank.ts';

/*
 * A Picker's actor: the Steps open, each with its query and highlighted
 * row, and the choices made so far, one per Step below the top one, after
 * any it was opened with.
 *
 * 1. Rows      a Step's rows come from the Props its owner hands it, as a
 *              list it already holds, or, for a Step without `rows`, from
 *              the owner's `load`, for its query: a listing cut short, or
 *              one of another scope, is asked again as the query changes.
 *              Pinned rows follow the ones that match, whatever the query.
 * 2. Pick      the highlight moves through the rows that can be chosen, as
 *              drawn, round from the last to the first; choosing a row opens
 *              the Step its `next` names, or finishes there; finishing ends
 *              on the highlighted row, or on the choices so far when
 *              nothing is highlighted, or, in a Step that says so, on the
 *              Step itself.
 * 3. Go        a query that names a place, such as a path, goes there: the
 *              Steps of its kind are dropped down to the first, and the
 *              Steps it names are opened from it.
 * 4. Back      drops the top Step and the choice that opened it; never
 *              below the Step it opened at.
 * 5. Done      the owner hears once: the choices it finished with and the
 *              Step it finished in, or null when it closed with none. In a
 *              Step the owner settles, the Picker stays, busy, until the
 *              owner has taken the choices, and only then finishes; a
 *              refusal says why in the Step, which can be chosen from
 *              again.
 */

export const How = Schema.Literals(['keys', 'pointer']);

const Row = Schema.Struct({
  value: Schema.String,
  label: Schema.String,
  /** A line under the label. */
  detail: Schema.optionalKey(Schema.String),
  /** Quiet text after the label, such as a model's month. */
  hint: Schema.optionalKey(Schema.String),
  /** The heading it is listed under. */
  group: Schema.optionalKey(Schema.String),
  /** What is in effect now. */
  checked: Schema.optionalKey(Schema.Boolean),
  /** Why it cannot be chosen. */
  unavailable: Schema.optionalKey(Schema.String),
  /** Drawn quieter than the rest, such as a Settled Session. */
  quiet: Schema.optionalKey(Schema.Boolean),
});
type Row = typeof Row.Type;

/** A Step's rows as the owner loaded them. */
const Loaded = Schema.Struct({
  rows: Schema.Array(Row),
  /** Only some of the rows that match: a narrower query is asked again. */
  truncated: Schema.Boolean,
  problem: Schema.NullOr(Schema.String),
});
type Loaded = typeof Loaded.Type;

const Choice = Schema.Struct({
  /** The Step it was made in, and which one. */
  step: Schema.String,
  key: Schema.String,
  value: Schema.String,
  label: Schema.String,
});
export type Choice = typeof Choice.Type;

const StepRef = Schema.Struct({ id: Schema.String, key: Schema.String });
type StepRef = typeof StepRef.Type;

/** A Step to open, and the search it opens with. */
type Opens = StepRef & { readonly query?: string };

const Step = Schema.Struct({
  ...StepRef.fields,
  query: Schema.String,
  /** The row highlighted, by value; '' for none. */
  highlighted: Schema.String,
  /** A loading Step's rows, and the query they answer. */
  listing: Schema.NullOr(
    Schema.Struct({ ...Loaded.fields, query: Schema.String }),
  ),
});
type Step = typeof Step.Type;

export const Opening = Schema.Struct({
  how: How,
  step: StepRef,
  /** Made before the first Step: shown in the trail, never gone back on. */
  choices: Schema.Array(Choice),
});

const Model = Schema.Struct({
  how: How,
  step: Step,
  /** The Steps under the top one, the first first. */
  below: Schema.Array(Step),
  choices: Schema.Array(Choice),
  finished: Schema.Boolean,
  /** Waiting for the owner to settle what was chosen. */
  busy: Schema.Boolean,
  /** The choices the owner is settling, while it is. */
  settling: Schema.NullOr(Schema.Array(Choice)),
  /** Settled: the owner hears it once the Surface is left. */
  taken: Schema.Boolean,
  /** Why the owner refused what was chosen. */
  refused: Schema.NullOr(Schema.String),
});
export type Model = typeof Model.Type;

export const Message = Schema.TaggedUnion({
  Typed: { query: Schema.String },
  Highlighted: { value: Schema.String },
  /** The highlight moves `by` rows, down for 1 and up for -1. */
  Moved: { by: Schema.Finite },
  Picked: { value: Schema.String },
  Finished: {},
  Back: {},
  Closed: {},
  Settled: { refused: Schema.NullOr(Schema.String) },
  Loaded: {
    depth: Schema.Finite,
    ...StepRef.fields,
    query: Schema.String,
    loaded: Loaded,
  },
});

/** Where a Step's own functions are: which one, the owner's Props, the choices so far, the search. */
interface At<P> {
  readonly key: string;
  readonly props: P;
  readonly choices: ReadonlyArray<Choice>;
  readonly query: string;
}

/** A Step's rows from the Props: null while the owner is still getting them. */
interface Listing {
  readonly rows: ReadonlyArray<Row>;
  readonly loading?: boolean;
  /** Why the rows could not be read. */
  readonly problem?: string | null;
}

export interface StepSpec<P> {
  /** What the search field asks while it is empty. */
  readonly placeholder: (at: At<P>) => string;
  /** The last crumb of the trail, naming this Step; null when the choice that opened it does. */
  readonly title?: (at: At<P>) => string | null;
  /** Said when no row matches. */
  readonly empty?: (at: At<P>) => string;
  /** Its rows, from what the owner hands it; without them, the owner loads them. */
  readonly rows?: (at: At<P>) => Listing;
  /** The Step choosing `row` opens, and its search, or null to finish there. */
  readonly next?: (row: Row, at: At<P>) => Opens | null;
  /** Rows shown whatever the query, after those that match, from the rows the Step has. */
  readonly pinned?: (at: At<P>, rows: ReadonlyArray<Row>) => ReadonlyArray<Row>;
  /**
   * A query that names a place, such as a path: the Steps it opens, each
   * one in the last, from the first Step of this kind, and what is left of
   * it to search. Null for a query that names none.
   */
  readonly goes?: (
    query: string,
    at: At<P>,
  ) => {
    readonly steps: ReadonlyArray<{
      readonly step: StepRef;
      readonly value: string;
      readonly label: string;
    }>;
    readonly query: string;
  } | null;
  /** Loaded rows for one scope of query never answer another's, such as hidden folders for a query starting with `.`. */
  readonly scope?: (query: string) => string;
  /** What finishing ends on: the highlighted row, or this Step itself, with the choices that opened it. */
  readonly finishes?: 'row' | 'step';
  /** The owner settles what is chosen here: the Picker waits for it, and says why when it refuses. */
  readonly settles?: boolean;
}

export interface Spec<P> {
  /** What the owner hands it while it is open, such as the rows it holds. */
  readonly props: Schema.Codec<P, unknown, never, never>;
  readonly steps: Readonly<Record<string, StepSpec<P>>>;
  /**
   * Whether finishing on these choices takes the app somewhere, such as a
   * Session opened: the keyboard goes on to the page then, rather than
   * back to where the Picker was opened from.
   */
  readonly lands?: (choices: ReadonlyArray<Choice>) => boolean;
}

/** What the owner gives the Picker: where its choices go, and the rows it loads. */
interface Owner {
  /** The choices it finished with and the Step it finished in, or null when closed with none. */
  readonly done: (
    choices: ReadonlyArray<Choice> | null,
    step: StepRef | null,
  ) => Effect.Effect<void>;
  readonly load: (step: StepRef, query: string) => Effect.Effect<Loaded>;
  /** Takes what a Step that settles finished with, giving null, or why not; `done` hears it after. */
  readonly settle: (
    choices: ReadonlyArray<Choice>,
    step: StepRef,
  ) => Effect.Effect<string | null>;
}

// 1. Rows -------------------------------------------------------------------

const atOf = <P>(model: Model, props: P): At<P> => ({
  key: model.step.key,
  props,
  choices: model.choices,
  query: model.step.query,
});

const covers = <P>(
  own: StepSpec<P> | undefined,
  listing: NonNullable<Step['listing']>,
  query: string,
) =>
  listing.query === query ||
  (!listing.truncated &&
    query.startsWith(listing.query) &&
    (own?.scope?.(listing.query) ?? '') === (own?.scope?.(query) ?? ''));

/** Whether the top Step waits for rows from the owner's `load`. */
const loading = <P>(spec: Spec<P>, step: Step) => {
  const own = spec.steps[step.id];
  return (
    own?.rows === undefined &&
    (step.listing === null || !covers(own, step.listing, step.query))
  );
};

/** The top Step's rows, best match first, with what to say about them. */
export const shownOf = <P>(spec: Spec<P>, model: Model, props: P) => {
  const own = spec.steps[model.step.id];
  const at = atOf(model, props);
  const listing: Listing =
    own?.rows?.(at) ??
    (model.step.listing === null
      ? { rows: [] }
      : { rows: model.step.listing.rows, problem: model.step.listing.problem });
  const waiting = listing.loading === true || loading(spec, model.step);
  const pinned = own?.pinned?.(at, waiting ? [] : listing.rows) ?? [];
  return {
    groups: groupsOf([
      ...rank(listing.rows, model.step.query),
      ...pinned.map((entry) => ({ entry, matched: [] })),
    ]),
    rows: [...listing.rows, ...pinned],
    loading: waiting,
    problem: model.refused ?? listing.problem ?? null,
    placeholder: own?.placeholder(at) ?? '',
    title: own?.title?.(at) ?? null,
    empty: own?.empty?.(at) ?? 'Nothing by that name',
  };
};

/** The rows under their headings, each heading where its first row ranks. */
const groupsOf = (ranked: ReadonlyArray<Ranked<Row>>) => {
  const groups = new Map<string, Array<Ranked<Row>>>();
  for (const each of ranked) {
    const heading = each.entry.group ?? '';
    groups.set(heading, [...(groups.get(heading) ?? []), each]);
  }
  return [...groups].map(([heading, rows]) => ({ heading, rows }));
};

const fresh = ({ id, key, query }: Opens): Step => ({
  id,
  key,
  query: query ?? '',
  highlighted: '',
  listing: null,
});

// 2. Pick -------------------------------------------------------------------

/** What choosing the row `value` does: finish, open a Step, or nothing. */
export const outcomeOf = <P>(
  spec: Spec<P>,
  model: Model,
  props: P,
  value: string,
):
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Finish'; readonly choice: Choice }
  | {
      readonly _tag: 'Next';
      readonly choice: Choice;
      readonly next: Opens;
    } => {
  if (model.finished || model.busy) return { _tag: 'None' };
  const row = shownOf(spec, model, props).rows.find(
    (each) => each.value === value,
  );
  if (row === undefined || row.unavailable !== undefined)
    return { _tag: 'None' };
  const choice = {
    step: model.step.id,
    key: model.step.key,
    value: row.value,
    label: row.label,
  };
  const next =
    spec.steps[model.step.id]?.next?.(row, atOf(model, props)) ?? null;
  return next === null
    ? { _tag: 'Finish', choice }
    : { _tag: 'Next', choice, next };
};

/** The rows that can be chosen, as drawn. */
const choosable = <P>(spec: Spec<P>, model: Model, props: P) =>
  shownOf(spec, model, props)
    .groups.flatMap(({ rows }) => rows)
    .filter(({ entry }) => entry.unavailable === undefined)
    .map(({ entry }) => entry.value);

/** The Model with the best row highlighted, or, with `keep`, the one highlighted while it is still shown. */
const highlightedIn = <P>(
  spec: Spec<P>,
  model: Model,
  props: P,
  keep: boolean,
): Model => {
  const values = choosable(spec, model, props);
  const now = model.step.highlighted;
  const highlighted = keep && values.includes(now) ? now : (values[0] ?? '');
  return { ...model, step: { ...model.step, highlighted } };
};

/** The row `by` rows from the highlighted one, among those that can be chosen. */
const movedFrom = <P>(spec: Spec<P>, model: Model, props: P, by: number) => {
  const values = choosable(spec, model, props);
  if (values.length === 0) return model.step.highlighted;
  const at = values.indexOf(model.step.highlighted);
  const from = at === -1 ? (by > 0 ? -1 : 0) : at;
  const next = (((from + by) % values.length) + values.length) % values.length;
  return values[next] ?? model.step.highlighted;
};

/** Whether finishing does anything: on the Step, the highlighted row, or the choices so far. */
export const finishes = <P>(spec: Spec<P>, model: Model, props: P) =>
  !model.finished &&
  !model.busy &&
  (spec.steps[model.step.id]?.finishes === 'step' ||
    outcomeOf(spec, model, props, model.step.highlighted)._tag !== 'None' ||
    model.choices.length > 0);

/** What finishing now ends on: the Step itself, the highlighted row, or the choices so far. */
export const finishingWith = <P>(spec: Spec<P>, model: Model, props: P) => {
  if (spec.steps[model.step.id]?.finishes === 'step') return model.choices;
  const outcome = outcomeOf(spec, model, props, model.step.highlighted);
  return outcome._tag === 'None'
    ? model.choices
    : [...model.choices, outcome.choice];
};

/** Whether the owner settles what the top Step finishes with, so the Picker waits. */
export const settles = <P>(spec: Spec<P>, model: Model) =>
  spec.steps[model.step.id]?.settles === true;

// 3. Go ---------------------------------------------------------------------

/** The Model with `query` typed: searched, or gone to the place it names. */
const typed = <P>(spec: Spec<P>, model: Model, props: P, query: string) => {
  const step = { ...model.step, query };
  const gone = spec.steps[step.id]?.goes?.(query, {
    ...atOf(model, props),
    query,
  });
  if (gone === undefined || gone === null)
    return { ...model, step, refused: null };
  // Down to the first Step of this kind, and the choices made above it.
  const stack = [...model.below, step];
  const first = stack.findIndex(
    (each, at) =>
      each.id === step.id &&
      stack.slice(at).every((above) => above.id === step.id),
  );
  const root = stack[first] ?? step;
  const kept = model.below.slice(0, first);
  const dropped = stack.length - 1 - first;
  let next: Model = {
    ...model,
    step: { ...root, query: '', highlighted: '' },
    below: kept,
    choices: model.choices.slice(0, model.choices.length - dropped),
    refused: null,
  };
  for (const { step: ref, value, label } of gone.steps)
    next = {
      ...next,
      step: fresh(ref),
      below: [...next.below, next.step],
      choices: [
        ...next.choices,
        { step: next.step.id, key: next.step.key, value, label },
      ],
    };
  return { ...next, step: { ...next.step, query: gone.query } };
};

// The Actor -----------------------------------------------------------------

/** A Picker's actor, and the Layer its owner gives it. */
export const build = <const Name extends string, P>(
  name: Name,
  spec: Spec<P>,
) => {
  const Owner = Context.Service<{ readonly picker: Name }, Owner>(
    `code/Picker/${name}`,
  );

  // 5. Done
  const done = Command.make(`${name}Done`, {
    args: Schema.Struct({
      choices: Schema.NullOr(Schema.Array(Choice)),
      step: Schema.NullOr(StepRef),
    }),
    run: ({ choices, step }) =>
      Effect.flatMap(Owner, (owner) => owner.done(choices, step)),
  });

  const settle = Command.make(`${name}Settle`, {
    args: Schema.Struct({ choices: Schema.Array(Choice), step: StepRef }),
    run: ({ choices, step }) =>
      Effect.flatMap(Owner, (owner) => owner.settle(choices, step)).pipe(
        Effect.map((refused) => ({ _tag: 'Settled' as const, refused })),
      ),
  });

  const Picker = Actor.define(name, {
    requires: [Owner],
    input: Opening,
    props: spec.props,
    model: Model,
    message: Message,
  });

  const finish = (model: Model, choices: ReadonlyArray<Choice>) => {
    const step = { id: model.step.id, key: model.step.key };
    return settles(spec, model)
      ? {
          model: { ...model, busy: true, settling: choices, refused: null },
          command: settle({ choices, step }),
        }
      : {
          model: { ...model, choices, finished: true },
          command: done({ choices, step }),
        };
  };

  const Live = Actor.build(Picker, {
    // No row is highlighted until the View reports the first one shown.
    init: (opening) => ({
      model: {
        how: opening.how,
        step: fresh(opening.step),
        below: [],
        choices: opening.choices,
        finished: false,
        busy: false,
        settling: null,
        taken: false,
        refused: null,
      },
    }),
    workers: {
      // 1. Rows, for a Step the owner loads: again as its query outgrows them.
      load: {
        each: ({ model }) =>
          loading(spec, model.step)
            ? [
                JSON.stringify([
                  model.below.length,
                  model.step.id,
                  model.step.key,
                  model.step.query,
                ]),
              ]
            : [],
        run: (self) =>
          Effect.gen(function* () {
            const { model } = yield* self.get;
            const { id, key, query } = model.step;
            const owner = yield* Owner;
            const loaded = yield* owner.load({ id, key }, query);
            yield* self.send({
              _tag: 'Loaded',
              depth: model.below.length,
              id,
              key,
              query,
              loaded,
            });
          }),
      },
    },
    on: {
      // The best row is highlighted as the search changes.
      Typed: ({ query }, { model, props }) =>
        model.busy
          ? {}
          : {
              model: highlightedIn(
                spec,
                typed(spec, model, props, query),
                props,
                false,
              ),
            },
      Highlighted: ({ value }, { model }) => ({
        model: { ...model, step: { ...model.step, highlighted: value } },
      }),
      Moved: ({ by }, { model, props }) => ({
        model: {
          ...model,
          step: {
            ...model.step,
            highlighted: movedFrom(spec, model, props, by),
          },
        },
      }),
      Loaded: ({ depth, id, key, query, loaded }, { model, props }) =>
        depth !== model.below.length ||
        id !== model.step.id ||
        key !== model.step.key
          ? {}
          : {
              model: highlightedIn(
                spec,
                {
                  ...model,
                  step: { ...model.step, listing: { ...loaded, query } },
                },
                props,
                true,
              ),
            },
      // 2. Pick
      Picked: ({ value }, { model, props }) => {
        const outcome = outcomeOf(spec, model, props, value);
        switch (outcome._tag) {
          case 'None':
            return {};
          case 'Finish':
            return finish(model, [...model.choices, outcome.choice]);
          case 'Next': {
            const opened = {
              ...model,
              step: fresh({ ...outcome.next, query: '' }),
              below: [...model.below, model.step],
              choices: [...model.choices, outcome.choice],
              refused: null,
            };
            const query = outcome.next.query ?? '';
            return {
              model: highlightedIn(
                spec,
                query === '' ? opened : typed(spec, opened, props, query),
                props,
                false,
              ),
            };
          }
        }
      },
      Finished: (_, { model, props }) =>
        finishes(spec, model, props)
          ? finish(model, finishingWith(spec, model, props))
          : {},
      // 4. Back
      Back: (_, { model }) => {
        const under = model.below.at(-1);
        if (under === undefined || model.finished || model.busy) return {};
        return {
          model: {
            ...model,
            step: under,
            below: model.below.slice(0, -1),
            choices: model.choices.slice(0, -1),
            refused: null,
          },
        };
      },
      // 5. Done: taken, it finishes, and the View leaves the Surface, after
      // which the owner hears, so it never drops a Picker still entered;
      // refused, it can be chosen from again.
      Settled: ({ refused }, { model }) =>
        refused !== null
          ? { model: { ...model, busy: false, settling: null, refused } }
          : {
              model: {
                ...model,
                busy: false,
                settling: null,
                choices: model.settling ?? model.choices,
                finished: true,
                taken: true,
              },
            },
      Closed: (_, { model }) =>
        model.taken
          ? {
              model: { ...model, taken: false },
              command: done({
                choices: model.choices,
                step: { id: model.step.id, key: model.step.key },
              }),
            }
          : model.finished
            ? {}
            : {
                model: { ...model, finished: true },
                command: done({ choices: null, step: null }),
              },
    },
  });

  /** The Layer an owner Provides: where the choices go, how its Steps load, and how it settles them. */
  const owner = (given: {
    readonly done: Owner['done'];
    readonly load?: Owner['load'];
    readonly settle?: Owner['settle'];
  }) =>
    Layer.succeed(Owner, {
      done: given.done,
      settle:
        given.settle ??
        ((choices, step) => Effect.as(given.done(choices, step), null)),
      load:
        given.load ??
        (() =>
          Effect.succeed({
            rows: [],
            truncated: false,
            problem: 'Nothing loads here',
          })),
    });

  return { Live, owner };
};
