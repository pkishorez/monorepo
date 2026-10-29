import type { BackfillDeclaration } from '../../std-table/definition/index.js';

/** One scan of one entity: every pending Backfill it runs, in order. */
export interface Stage {
  readonly entity: string;
  readonly backfills: readonly BackfillDeclaration[];
}

/** The pending Backfills cannot be ordered into scans that run. */
export class BackfillOrderRefused extends Error {
  readonly _tag = 'BackfillOrderRefused';

  constructor(readonly detail: string) {
    super(detail);
    this.name = 'BackfillOrderRefused';
  }
}

/**
 * One stage per entity: all of its pending Backfills, gap and reindex alike,
 * run in one scan that writes each row once, at the latest version with
 * fresh keys. Stages are ordered by the `after` edges between them (a
 * Backfill already done is no longer waited for), in declaration order where
 * nothing decides. A cycle between entities cannot run and is refused.
 */
export const planStages = (
  pending: readonly BackfillDeclaration[],
): readonly Stage[] => {
  const entityOf = new Map(pending.map(({ id, entity }) => [id, entity]));
  const entities = [...new Set(pending.map(({ entity }) => entity))];
  const waitsOn = new Map(
    entities.map((entity) => [
      entity,
      new Set(
        pending
          .filter((backfill) => backfill.entity === entity)
          .flatMap(({ after }) => after)
          .flatMap((id) => {
            const other = entityOf.get(id);
            return other === undefined || other === entity ? [] : [other];
          }),
      ),
    ]),
  );
  const order: string[] = [];
  const left = [...entities];
  while (left.length > 0) {
    const next = left.find((entity) =>
      [...waitsOn.get(entity)!].every((other) => order.includes(other)),
    );
    if (next === undefined)
      throw new BackfillOrderRefused(
        `the pending Backfills of ${left.join(', ')} wait on one another in a cycle (${pending
          .filter(({ entity }) => left.includes(entity))
          .map(({ id }) => `"${id}"`)
          .join(', ')}); each entity's Backfills run in one scan`,
      );
    order.push(next);
    left.splice(left.indexOf(next), 1);
  }
  return order.map((entity) => ({
    entity,
    backfills: pending.filter((backfill) => backfill.entity === entity),
  }));
};
