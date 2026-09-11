import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import * as Plan from 'alchemy/Plan';
import type { ResourceState, StateService } from 'alchemy/State';
import { isActionState } from 'alchemy/State';
import { encodeState } from 'alchemy/State/StateEncoding';
import type {
  analysisEvent,
  deletionPlan,
} from '../../../../shared/contracts/delete-stage/index.ts';
import type { awsConnection } from '../../../../shared/contracts/state-stores/index.ts';
import { check } from '../provider-catalog/index.ts';

export class PrepareError extends Error {
  constructor(
    message: string,
    readonly resource: string | null = null,
  ) {
    super(message);
    this.name = 'PrepareError';
  }
}
export const stageChanged = () =>
  new PrepareError('The stage changed. Review a new deletion plan.');
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, v]) => [key, stable(v)]),
        )
      : value;
const generations = (row: ResourceState): ResourceState[] =>
  row.status === 'replacing' || row.status === 'replaced'
    ? [row, ...generations(row.old)]
    : [row];

export const prepare = (
  input: {
    stack: string;
    stage: string;
    connection: { accountId: string; apiToken: string };
    aws?: typeof awsConnection.Type | null;
  },
  state: StateService,
  emit: (event: typeof analysisEvent.Type) => void = () => {},
) =>
  Effect.gen(function* () {
    const target = { stack: input.stack, stage: input.stage };
    const snapshot = () =>
      Effect.gen(function* () {
        if (!(yield* state.listStages(input.stack)).includes(input.stage))
          return yield* Effect.fail(
            new PrepareError('This stage no longer exists.'),
          );
        const ids = [...(yield* state.list(target))].sort();
        const rows = yield* Effect.forEach(
          ids,
          (fqn) => state.get({ ...target, fqn }),
          { concurrency: 4 },
        );
        const replaced = yield* state.getReplacedResources(target);
        const output = yield* state.getOutput(target);
        const fingerprint = createHash('sha256')
          .update(
            JSON.stringify(
              stable(
                encodeState({
                  ...target,
                  ids,
                  rows,
                  replaced,
                  output,
                  accountId: input.connection.accountId,
                  aws: input.aws
                    ? {
                        type: input.aws.type,
                        region: input.aws.region,
                        // Bind the review to credentials without including them in the response.
                        identity: createHash('sha256')
                          .update(
                            input.aws.accessKeyId +
                              '\0' +
                              input.aws.secretAccessKey,
                          )
                          .digest('hex'),
                      }
                    : null,
                }),
              ),
            ),
          )
          .digest('hex');
        return { fingerprint, rows, replaced };
      });
    const before = yield* snapshot();
    const resources: (typeof deletionPlan.Type.resources)[number][] = [];
    // Include detached and nested replacement generations, even if another row is blocked.
    for (const row of [...before.rows, ...before.replaced]) {
      if (!row) continue;
      if (isActionState(row)) {
        resources.push({
          id: row.fqn,
          type: 'Action',
          action: 'forget',
          after: [],
          previous: [],
          readiness: 'ready',
          reason: null,
        });
        continue;
      }
      emit({ kind: 'analyzing', id: row.fqn, type: row.resourceType });
      const versions = generations(row);
      const findings = yield* Effect.forEach(versions, (version) =>
        check(input, version),
      );
      const blockedIndex = findings.findIndex(
        (finding) => finding.readiness !== 'ready',
      );
      const finding = findings[blockedIndex < 0 ? 0 : blockedIndex]!;
      resources.push({
        id: row.fqn,
        type: row.resourceType,
        action: row.removalPolicy === 'retain' ? 'retain' : 'delete',
        after: row.downstream,
        previous: versions.slice(1).map((old) => ({
          type: old.resourceType,
          action: row.removalPolicy === 'retain' ? 'retain' : 'delete',
        })),
        ...finding,
        reason:
          blockedIndex > 0
            ? `Previous version (${versions[blockedIndex]!.resourceType}): ${finding.reason}`
            : finding.reason,
      });
      emit({ kind: 'analyzed', id: row.fqn, type: row.resourceType });
    }
    const plan = resources.every((resource) => resource.readiness === 'ready')
      ? yield* Plan.destroy({ name: input.stack, stage: input.stage })
      : null;
    if (before.fingerprint !== (yield* snapshot()).fingerprint)
      return yield* Effect.fail(stageChanged());
    return { plan, resources, fingerprint: before.fingerprint };
  });
