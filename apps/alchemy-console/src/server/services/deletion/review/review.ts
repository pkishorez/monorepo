import { createHash } from 'node:crypto';
import { Effect, Option } from 'effect';
import * as Plan from 'alchemy/Plan';
import { tryFindProviderByType } from 'alchemy/Provider';
import { stampedMode } from 'alchemy/ProviderMode';
import type { ResourceState, StateService } from 'alchemy/State';
import { isActionState } from 'alchemy/State';
import { encodeState } from 'alchemy/State/StateEncoding';
import { providerLabels } from '../../../../shared/contracts/credentials/index.ts';
import type {
  analysisEvent,
  deletionPlan,
} from '../../../../shared/contracts/deletion/index.ts';
import {
  check as providerCheck,
  providerOf,
  supportsDeletion,
} from '../../../providers/providers/index.ts';
import { identity, selectionFor, type Selection } from '../selection/index.ts';

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

type Forget = readonly { id: string; type: string }[] | null | undefined;
export const isForgotten = (
  forget: Forget,
  row: { fqn: string; resourceType: string },
) =>
  !!forget?.some(
    (entry) => entry.id === row.fqn && entry.type === row.resourceType,
  );

// Random and KeyPair live only in state; deleting them drops the row.
const alchemyOnly = (type: string) =>
  ['Alchemy.Random', 'Alchemy.KeyPair'].includes(type);
const deletable = (type: string) => supportsDeletion(type) || alchemyOnly(type);

/** Every recorded row of one stage, read once so review and fingerprint agree. */
export const snapshot = (
  state: StateService,
  target: { stack: string; stage: string },
) =>
  Effect.gen(function* () {
    if (!(yield* state.listStages(target.stack)).includes(target.stage))
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
    return { ids, rows, replaced, output };
  });
export type Snapshot = Effect.Success<ReturnType<typeof snapshot>>;

/** Resource rows the review inspects, including replacement generations. */
export const resourceRows = (loaded: Snapshot): ResourceState[] =>
  [...loaded.rows, ...loaded.replaced].filter(
    (row): row is ResourceState => !!row && !isActionState(row),
  );

const fingerprintOf = (
  target: { stack: string; stage: string },
  loaded: Snapshot,
  selections: readonly Selection[],
) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        stable(
          encodeState({
            ...target,
            ids: loaded.ids,
            rows: loaded.rows,
            replaced: loaded.replaced,
            output: loaded.output,
            credentials: selections.map(identity),
          }),
        ),
      ),
    )
    .digest('hex');

const checkRow = (
  input: { forget?: Forget; selections: readonly Selection[] },
  row: ResourceState,
) =>
  Effect.gen(function* () {
    const type = row.resourceType;
    const unsupported = (reason: string) => ({
      readiness: 'unsupported' as const,
      reason,
    });
    const blocked = (reason: string) => ({
      readiness: 'blocked' as const,
      reason,
    });
    const missing = (reason: string) => ({
      readiness: 'missing-credentials' as const,
      reason,
    });
    // A forgotten row only loses its state, so nothing below can block it.
    if (isForgotten(input.forget, row))
      return { readiness: 'ready' as const, reason: null };
    if (!deletable(type))
      return unsupported(
        `Console does not support deleting ${type}. Use alchemy destroy from the project.`,
      );
    if (stampedMode(row) === 'local')
      return blocked(
        'This resource was created in local mode and cannot be deleted from Console.',
      );
    const kind = providerOf(type);
    const selection = kind ? selectionFor(input.selections, kind) : null;
    if (kind && !selection?.selected)
      return missing(
        `Choose a ${providerLabels[kind]} credential for this stage.`,
      );
    if (selection?.needsRegion && !selection.region)
      return missing(
        `Choose the ${providerLabels[selection.provider]} region for this stage.`,
      );
    if (Option.isNone(yield* tryFindProviderByType(type, 'live')))
      return unsupported(
        `Console has no live provider for ${type}. Use alchemy destroy from the project.`,
      );
    const reason = selection?.selected
      ? yield* providerCheck(selection.selected, selection.region, row)
      : null;
    return reason
      ? blocked(reason)
      : { readiness: 'ready' as const, reason: null };
  });

export const prepare = (
  input: {
    stack: string;
    stage: string;
    forget?: Forget;
    selections: readonly Selection[];
    before: Snapshot;
  },
  state: StateService,
  emit: (event: typeof analysisEvent.Type) => void = () => {},
) =>
  Effect.gen(function* () {
    const target = { stack: input.stack, stage: input.stage };
    const before = fingerprintOf(target, input.before, input.selections);
    const resources: (typeof deletionPlan.Type.resources)[number][] = [];
    // Include detached and nested replacement generations, even if another row is blocked.
    for (const row of [...input.before.rows, ...input.before.replaced]) {
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
        checkRow(input, version),
      );
      const blockedIndex = findings.findIndex(
        (finding) => finding.readiness !== 'ready',
      );
      const finding = findings[blockedIndex < 0 ? 0 : blockedIndex]!;
      resources.push({
        id: row.fqn,
        type: row.resourceType,
        action: isForgotten(input.forget, row)
          ? 'forget'
          : row.removalPolicy === 'retain'
            ? 'retain'
            : 'delete',
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
    const after = fingerprintOf(
      target,
      yield* snapshot(state, target),
      input.selections,
    );
    if (before !== after) return yield* Effect.fail(stageChanged());
    return { plan, resources, fingerprint: before };
  });
