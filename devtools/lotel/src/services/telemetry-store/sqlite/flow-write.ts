import { Effect } from 'effect';
import type { DatabaseError } from 'std-toolkit/db';
import { updateFlowEntity } from '../../../domain/flow/index.js';
import type { makeSqliteEntities } from './entities.js';

type FlowEntities = Pick<
  ReturnType<typeof makeSqliteEntities>,
  'flows' | 'table'
>;

const CONTENDED_WRITE_RETRIES = 5;

const isContendedWrite = (error: DatabaseError) =>
  error.reason._tag === 'ConditionFailed' ||
  error.reason._tag === 'ItemAlreadyExists' ||
  error.reason._tag === 'NoItemToUpdate';

/** Atomically writes one telemetry record and advances its Flow catalog entry. */
/** @internal */
export const writeFlowRecord = (
  entities: FlowEntities,
  options: {
    readonly flowId: string | null;
    readonly latestTimeUnixNano: string;
    readonly recordOperation:
      | ReturnType<ReturnType<typeof makeSqliteEntities>['spans']['insertOp']>
      | ReturnType<ReturnType<typeof makeSqliteEntities>['logs']['insertOp']>;
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
          updateFlowEntity(flowId, options.latestTimeUnixNano, current),
        )
      : yield* entities.flows.insertOp(
          updateFlowEntity(flowId, options.latestTimeUnixNano),
        );

    yield* entities.table.transact([recordOperation, flowOperation]);
  });

  return attempt.pipe(
    Effect.retry({ times: CONTENDED_WRITE_RETRIES, while: isContendedWrite }),
  );
};
