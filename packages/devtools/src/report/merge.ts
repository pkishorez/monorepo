import type { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { DevtoolsRpc } from '../rpc/index.js';

type DevtoolsRpcs = RpcGroup.Rpcs<typeof DevtoolsRpc>;

type RpcSuccess<Tag extends string> = Rpc.Success<
  Rpc.ExtractTag<DevtoolsRpcs, Tag>
>;

/** The `RunVtestDocs` success payload (fast docs, tests in `pending`). */
export type RunVtestDocsResult = RpcSuccess<'RunVtestDocs'>;
/** The `RunVtestRun` success payload (flat per-test run records). */
export type RunVtestRunResult = RpcSuccess<'RunVtestRun'>;

/** The `available: true` docs payload, shaped like a `VtestView` config. */
export type VtestDocs = Extract<RunVtestDocsResult, { available: true }>;
/** A single flat run record from `RunVtestRun`. */
export type RunRecord = Extract<
  RunVtestRunResult,
  { available: true }
>['records'][number];

/** Stable lookup key for matching a docs test to a run record. */
const recordKey = (feature: string, groupId: string, name: string): string =>
  `${feature} ${groupId} ${name}`;

/**
 * Merge slow run records into the fast docs payload, returning a new
 * docs-shaped object where each test's `status`/`durationMs`/`error` is filled
 * from the matching record (keyed by feature name + groupId + test name). Pure:
 * `docs` is left untouched, and tests without a record keep their docs values
 * (typically `pending`).
 */
export function mergeRunRecords(
  docs: VtestDocs,
  records: readonly RunRecord[] | undefined,
): VtestDocs {
  if (!records || records.length === 0) return docs;

  const byKey = new Map<string, RunRecord>();
  for (const r of records)
    byKey.set(recordKey(r.feature, r.groupId, r.name), r);

  return {
    ...docs,
    features: docs.features.map((feature) => ({
      ...feature,
      groups: feature.groups.map((group) => ({
        ...group,
        tests: group.tests.map((test) => {
          const record = byKey.get(
            recordKey(feature.name, group.id, test.name),
          );
          if (!record) return test;
          return {
            ...test,
            status: record.status,
            durationMs: record.durationMs,
            error: record.error,
          };
        }),
      })),
    })),
  };
}
