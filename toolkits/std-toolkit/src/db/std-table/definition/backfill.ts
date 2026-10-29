import type { Effect } from 'effect';
import { gapVersions } from '../../../eschema/index.js';
import type { EntityDeclaration } from './definition.js';

/**
 * A Backfill as the table records it (ADR 0020): one that fills a gap
 * version of an entity (`kind: 'gap'`, with the version it fills in `to`),
 * or one that reindexes an entity's rows (`kind: 'reindex'`, `to: null`).
 * Snapshot capture reads this.
 */
export interface RegisteredBackfill {
  readonly id: string;
  readonly kind: 'gap' | 'reindex';
  readonly entity: string;
  readonly to: string | null;
  /** Ids of Backfills declared earlier that must finish before this one. */
  readonly after: readonly string[];
}

/** The step that fills a gap version: the row at the version before, and the table's reads. */
export type BackfillRun = (
  value: never,
  db: never,
) => Effect.Effect<unknown, unknown, unknown>;

/** A Backfill as declared, with the step the setup runner calls. */
export interface BackfillDeclaration extends RegisteredBackfill {
  /** Null for a reindex, which only rewrites the row it read. */
  readonly run: BackfillRun | null;
}

export type BackfillOptions =
  | {
      readonly entity: string;
      readonly to: string;
      readonly after?: readonly string[];
      readonly run: BackfillRun;
    }
  | { readonly reindex: string; readonly after?: readonly string[] };

const entityNamed = (
  entities: readonly EntityDeclaration[],
  name: string,
): EntityDeclaration => {
  const found = entities.find(({ schema }) => schema.name === name);
  if (found === undefined)
    throw new Error(`Backfill entity "${name}" is not declared on this table`);
  return found;
};

/** The table's Backfills with one more, refused unless it is well formed. */
export const addBackfill = (
  entities: readonly EntityDeclaration[],
  backfills: readonly BackfillDeclaration[],
  id: string,
  options: BackfillOptions,
): readonly BackfillDeclaration[] => {
  if (id === '') throw new Error('Backfill id must not be empty');
  if (backfills.some((backfill) => backfill.id === id))
    throw new Error(`Backfill "${id}" is already declared`);
  const after = [...(options.after ?? [])];
  for (const earlier of after)
    if (!backfills.some((backfill) => backfill.id === earlier))
      throw new Error(
        `Backfill "${id}" runs after "${earlier}", which is not declared before it`,
      );
  if ('reindex' in options) {
    const entity = entityNamed(entities, options.reindex);
    if (entity.kind === 'single')
      throw new Error(
        `Backfill "${id}" reindexes "${options.reindex}", a single entity, which has no indexes`,
      );
    return [
      ...backfills,
      Object.freeze({
        id,
        kind: 'reindex',
        entity: options.reindex,
        to: null,
        after: Object.freeze(after),
        run: null,
      }),
    ];
  }
  const entity = entityNamed(entities, options.entity);
  if (!gapVersions(entity.schema).includes(options.to))
    throw new Error(
      `Backfill "${id}" fills ${options.entity} ${options.to}, which is not a gap version of ${options.entity}`,
    );
  const taken = backfills.find(
    (backfill) =>
      backfill.kind === 'gap' &&
      backfill.entity === options.entity &&
      backfill.to === options.to,
  );
  if (taken !== undefined)
    throw new Error(
      `Backfill "${id}" fills ${options.entity} ${options.to}, which Backfill "${taken.id}" already fills`,
    );
  return [
    ...backfills,
    Object.freeze({
      id,
      kind: 'gap',
      entity: options.entity,
      to: options.to,
      after: Object.freeze(after),
      run: options.run,
    }),
  ];
};

/** Refuses a table with a gap version no Backfill fills. */
export const assertGapsFilled = (
  entities: readonly EntityDeclaration[],
  backfills: readonly BackfillDeclaration[],
): void => {
  const missing = entities.flatMap(({ schema }) =>
    gapVersions(schema)
      .filter(
        (version) =>
          !backfills.some(
            (backfill) =>
              backfill.kind === 'gap' &&
              backfill.entity === schema.name &&
              backfill.to === version,
          ),
      )
      .map((version) => `${schema.name} ${version}`),
  );
  if (missing.length > 0)
    throw new Error(
      `Every gap version needs a Backfill; none fills ${missing.join(', ')}`,
    );
};
