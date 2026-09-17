import { Effect, Schema } from 'effect';
import { nextUlid } from '../../../core/index.js';
import { ESchema } from '../../../eschema/index.js';
import {
  SnapshotSubjectSchema,
  TableSnapshotSchema,
  type SnapshotSubject,
  type TableSnapshot,
} from '../../../snapshot/index.js';
import {
  ConditionFailure,
  type ContractFailure,
  type EncodedData,
  type ItemCondition,
  type StdTableContract,
} from '../contract/index.js';
import { DatabaseError, OperationFailed } from '../error/index.js';
import { TABLE_STATE_ENTITY, TABLE_STATE_KEY } from '../key/index.js';

/**
 * What one registered entity's rows are known to need, kept by the table.
 * `epoch` changes whenever every replica of the entity must be dropped and
 * refetched — rows vanished without tombstones, or the entity was reshaped in
 * a way read migration cannot bridge. It is not the entity's ESchema version.
 */
export interface EntityState {
  readonly epoch: string;
}

/**
 * One `requires-backfill` outcome enforcement accepted but nothing has
 * repaired yet: the snapshot subject that changed, and the ULID of the
 * enforcement run that recorded it.
 */
export interface BackfillNeed {
  readonly subject: SnapshotSubject;
  readonly since: string;
}

/**
 * The record a table keeps about itself at its reserved key: the approved
 * contract snapshot enforcement last accepted (`null` until a first
 * `verifySnapshot`), one entry per entity it has ever enforced or wiped, and
 * every backfill still owed. Empty `backfill` means the stored rows answer
 * every access pattern the current contract declares.
 */
export interface TableState {
  readonly snapshot: TableSnapshot | null;
  readonly entities: Readonly<Record<string, EntityState>>;
  readonly backfill: readonly BackfillNeed[];
}

/** The state as read from the table, with the `_u` that guards its next write. */
export interface StoredTableState {
  readonly state: TableState;
  readonly updated: string | null;
}

const CONFLICT_RETRIES = 3;

// The record is an ESchema so its shape can evolve the way every stored row
// does: append `.evolve('v2', delta, migrate)` and a record written at v1 still
// reads. The snapshot rides as an opaque object because `TableSnapshotSchema`
// carries a filter the ESchema field policy refuses; it is validated on its own
// right after decode.
const TableStateSchema = ESchema.make('StdTableState', {
  snapshot: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  entities: Schema.Record(
    Schema.String,
    Schema.Struct({ epoch: Schema.String }),
  ),
  backfill: Schema.Array(
    Schema.Struct({ subject: SnapshotSubjectSchema, since: Schema.String }),
  ),
}).build();

const decodeSnapshot = Schema.decodeUnknownEffect(
  Schema.NullOr(TableSnapshotSchema),
);

export const emptyTableState = (): TableState => ({
  snapshot: null,
  entities: {},
  backfill: [],
});

const dbError = (operation: string, cause: unknown): DatabaseError =>
  new DatabaseError({ reason: new OperationFailed({ operation, cause }) });

const contractError = (
  operation: string,
  failure: ContractFailure,
): DatabaseError =>
  dbError(
    operation,
    failure instanceof ConditionFailure ? failure : failure.cause,
  );

// Before the record held epochs and backfill needs it was the bare
// TableSnapshot, recognisable by its own `kind`. Such an item still reads as
// a state whose only content is that baseline; the next write restamps it.
const widenLegacyBaseline = (data: unknown): unknown =>
  typeof data === 'object' &&
  data !== null &&
  'kind' in data &&
  data.kind === 'table'
    ? {
        _v: TableStateSchema.latestVersion,
        snapshot: data,
        entities: {},
        backfill: [],
      }
    : data;

const sortedEntities = (
  entities: Readonly<Record<string, EntityState>>,
): Readonly<Record<string, EntityState>> =>
  Object.fromEntries(
    Object.keys(entities)
      .sort()
      .map((name) => [name, entities[name] as EntityState]),
  );

const canonical = (state: TableState): string =>
  JSON.stringify({
    snapshot: state.snapshot,
    entities: sortedEntities(state.entities),
    backfill: state.backfill,
  });

/** Reads the table state record; a table that never wrote one reads as empty. */
export const readTableState = (
  contract: StdTableContract,
  operation: string,
): Effect.Effect<StoredTableState, DatabaseError> =>
  Effect.gen(function* () {
    const item = yield* contract
      .getItem(TABLE_STATE_KEY, { consistent: true })
      .pipe(Effect.mapError((failure) => contractError(operation, failure)));
    if (item === null) return { state: emptyTableState(), updated: null };
    const decoded = yield* TableStateSchema.decode(
      widenLegacyBaseline(item.data),
    ).pipe(Effect.mapError((cause) => dbError(operation, cause)));
    const snapshot = yield* decodeSnapshot(decoded.snapshot).pipe(
      Effect.mapError((cause) => dbError(operation, cause)),
    );
    return {
      state: {
        snapshot,
        entities: decoded.entities,
        backfill: decoded.backfill,
      },
      updated: item.meta._u,
    };
  });

const writeTableState = (
  contract: StdTableContract,
  operation: string,
  state: TableState,
  condition: ItemCondition,
): Effect.Effect<boolean, DatabaseError> =>
  Effect.gen(function* () {
    const updated = yield* nextUlid;
    const data = (yield* TableStateSchema.encode({
      snapshot: state.snapshot,
      entities: sortedEntities(state.entities),
      backfill: state.backfill,
    }).pipe(
      Effect.mapError((cause) => dbError(operation, cause)),
    )) as unknown as EncodedData;
    const result = yield* contract
      .writeItem({
        item: {
          pk: TABLE_STATE_KEY.pk,
          sk: TABLE_STATE_KEY.sk,
          meta: { _e: TABLE_STATE_ENTITY, _u: updated, _d: false },
          data,
          keys: {},
        },
        condition,
      })
      .pipe(Effect.result);
    if (result._tag === 'Success') return true;
    if (result.failure instanceof ConditionFailure) return false;
    return yield* Effect.fail(contractError(operation, result.failure));
  });

/**
 * Reads the state, lets `update` derive the next one, and writes it back
 * guarded on the `_u` that was read — retried a few times when a competing
 * writer moved it first. An update that returns the state unchanged writes
 * nothing. `update` may refuse with its own error, which passes through.
 */
export const modifyTableState = <E>(
  contract: StdTableContract,
  operation: string,
  update: (state: TableState) => Effect.Effect<TableState, E>,
): Effect.Effect<TableState, DatabaseError | E> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt <= CONFLICT_RETRIES; attempt++) {
      const current = yield* readTableState(contract, operation);
      const next = yield* update(current.state);
      if (canonical(next) === canonical(current.state)) return next;
      const written = yield* writeTableState(
        contract,
        operation,
        next,
        current.updated === null
          ? { kind: 'not-exists' }
          : { kind: 'updated', value: current.updated },
      );
      if (written) return next;
    }
    return yield* Effect.fail(dbError(operation, new ConditionFailure({})));
  });

/** The state with an epoch minted for every named entity that has none yet. */
export const withEntityEpochs = (
  state: TableState,
  names: readonly string[],
): Effect.Effect<TableState> =>
  Effect.gen(function* () {
    const entities = { ...state.entities };
    for (const name of names) {
      if (entities[name] === undefined)
        entities[name] = { epoch: yield* nextUlid };
    }
    return { ...state, entities };
  });

/** The state with a fresh epoch for every named entity, whether or not it had one. */
export const withNewEpochs = (
  state: TableState,
  names: readonly string[],
): Effect.Effect<TableState> =>
  Effect.gen(function* () {
    const entities = { ...state.entities };
    for (const name of names) entities[name] = { epoch: yield* nextUlid };
    return { ...state, entities };
  });

const subjectKey = (subject: SnapshotSubject): string =>
  JSON.stringify([
    subject.kind,
    subject.owner ?? '',
    subject.name ?? '',
    subject.version ?? '',
  ]);

/** The state owing `subjects` as well; a subject already owed keeps its earlier `since`. */
export const withBackfillNeeds = (
  state: TableState,
  subjects: readonly SnapshotSubject[],
  since: string,
): TableState => {
  const owed = new Set(state.backfill.map((need) => subjectKey(need.subject)));
  const added: BackfillNeed[] = [];
  for (const subject of subjects) {
    const key = subjectKey(subject);
    if (owed.has(key)) continue;
    owed.add(key);
    added.push({ subject, since });
  }
  return added.length === 0
    ? state
    : { ...state, backfill: [...state.backfill, ...added] };
};

/** The state no longer owing `subjects`; an omitted list settles every need. */
export const withoutBackfillNeeds = (
  state: TableState,
  subjects?: readonly SnapshotSubject[],
): TableState => {
  if (subjects === undefined)
    return state.backfill.length === 0 ? state : { ...state, backfill: [] };
  const settled = new Set(subjects.map(subjectKey));
  const backfill = state.backfill.filter(
    (need) => !settled.has(subjectKey(need.subject)),
  );
  return backfill.length === state.backfill.length
    ? state
    : { ...state, backfill };
};
