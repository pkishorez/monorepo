import type { RunEvent, RunPhase } from '../../shared/contracts/run/index.ts';

/*
 * What a run's events add up to, for drawing: the steps it went through,
 * and each resource of its plan with where it is now. A resource's row
 * comes from the plan, then follows every status Alchemy reported for it;
 * one reported but never planned (an action Alchemy ran) joins at the end.
 */

/** Where a resource is, as a row shows it. */
export type Progress =
  /** Planned, not yet begun. */
  | 'waiting'
  /** Being created, updated, deleted, … */
  | 'working'
  | 'done'
  | 'failed'
  /** The plan leaves it as it is. */
  | 'unchanged';

export interface ResourceRow {
  readonly fqn: string;
  readonly logicalId: string;
  readonly resourceType: string;
  /** What the plan does to it. */
  readonly action: string;
  /** Alchemy's last word on it; null before any. */
  readonly status: string | null;
  readonly message: string | null;
  readonly progress: Progress;
}

const DONE = new Set([
  'created',
  'updated',
  'deleted',
  'replaced',
  'adopted',
  'orphaned',
  'ran',
  'skipped',
]);

const progressOf = (action: string, status: string | null): Progress => {
  if (status === null) return action === 'noop' ? 'unchanged' : 'waiting';
  // Alchemy's `pending`: waiting on a resource it depends on.
  if (status === 'pending') return 'waiting';
  if (status === 'fail') return 'failed';
  return DONE.has(status) ? 'done' : 'working';
};

/** Every resource of the plan, as far as `events` tell; null before the plan. */
export const resourcesOf = (
  events: ReadonlyArray<RunEvent>,
): ReadonlyArray<ResourceRow> | null => {
  const rows = new Map<string, ResourceRow>();
  let planned = false;
  for (const { event } of events) {
    if (event._tag === 'Planned') {
      planned = true;
      for (const resource of event.resources)
        rows.set(resource.fqn, {
          ...resource,
          status: null,
          message: null,
          progress: progressOf(resource.action, null),
        });
    } else if (event._tag === 'ResourceStatus') {
      const row = rows.get(event.fqn);
      const action = row?.action ?? 'run';
      rows.set(event.fqn, {
        fqn: event.fqn,
        logicalId: event.logicalId,
        resourceType: event.resourceType,
        action,
        status: event.status,
        message: event.message ?? row?.message ?? null,
        progress: progressOf(action, event.status),
      });
    }
  }
  return planned || rows.size > 0 ? [...rows.values()] : null;
};

/** The steps the run has begun, in order, each once. */
export const phasesOf = (
  events: ReadonlyArray<RunEvent>,
): ReadonlyArray<RunPhase> => {
  const seen: Array<RunPhase> = [];
  for (const { event } of events)
    if (event._tag === 'Phase' && !seen.includes(event.phase))
      seen.push(event.phase);
  return seen;
};

/** `known` with `more` added, each `seq` once, in order. */
export const mergeBySeq = <A extends { readonly seq: number }>(
  known: ReadonlyArray<A>,
  more: ReadonlyArray<A>,
): ReadonlyArray<A> => {
  const last = known.at(-1)?.seq ?? 0;
  const fresh = more.filter((each) => each.seq > last);
  return fresh.length === 0 ? known : [...known, ...fresh];
};
