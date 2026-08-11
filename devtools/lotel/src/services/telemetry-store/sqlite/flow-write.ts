import { Effect } from 'effect';
import type { TerminalFlowStatus } from '@pkishorez/effect-tracer/flow';
import {
  SQLiteDatabase,
  type SQLiteError,
  type SqliteEntityOp,
} from 'std-toolkit/sqlite';
import { updateFlowEntity } from '../../../domain/flow/index.js';
import type { makeSqliteEntities } from './entities.js';

type FlowEntities = Pick<
  ReturnType<typeof makeSqliteEntities>,
  'flows' | 'table'
>;

const CONTENDED_WRITE_RETRIES = 5;

const isContendedWrite = (error: SQLiteError) =>
  error._tag === 'ConditionFailed' ||
  error._tag === 'ItemAlreadyExists' ||
  error._tag === 'NoItemToUpdate';

/** Atomically writes one telemetry record and advances its Flow catalog entry. */
export const writeFlowRecord = (
  entities: FlowEntities,
  options: {
    readonly flowId: string | null;
    readonly latestTimeUnixNano: string;
    readonly terminalStatus?: TerminalFlowStatus | undefined;
    readonly recordOperation: Effect.Effect<
      SqliteEntityOp,
      SQLiteError,
      SQLiteDatabase
    >;
  },
) => {
  const attempt = Effect.gen(function* () {
    const recordOperation = yield* options.recordOperation;
    if (!options.flowId) {
      yield* entities.table.transact([recordOperation]);
      return;
    }

    const flowId = options.flowId;
    const existing = yield* entities.flows.get({ flowId });
    const flowOperation = existing
      ? yield* entities.flows.getAndUpdateOp({ flowId }, (current) =>
          updateFlowEntity(
            flowId,
            options.latestTimeUnixNano,
            options.terminalStatus,
            current,
          ),
        )
      : yield* entities.flows.insertOp(
          updateFlowEntity(
            flowId,
            options.latestTimeUnixNano,
            options.terminalStatus,
          ),
        );

    yield* entities.table.transact([recordOperation, flowOperation]);
  });

  return attempt.pipe(
    Effect.retry({ times: CONTENDED_WRITE_RETRIES, while: isContendedWrite }),
  );
};
