import { Data } from 'effect';

export class ESchemaError extends Data.TaggedError('ESchemaError')<{
  message: string;
  data?: unknown;
  cause?: unknown;
}> {}

export class OutdatedVersion extends Data.TaggedError('OutdatedVersion')<{
  message: string;
  schema: string;
  version: string;
  latestVersion: string;
}> {}

/**
 * A stored value older than a gap version: no migration can reach the gap,
 * so the value reads only once a Backfill has rewritten it.
 */
export class NeedsBackfill extends Data.TaggedError('NeedsBackfill')<{
  message: string;
  schema: string;
  version: string;
  gapVersion: string;
}> {}

export const needsBackfill = (
  schema: string,
  version: string,
  gapVersion: string,
): NeedsBackfill =>
  new NeedsBackfill({
    message: `${schema} ${version} needs a Backfill to reach gap version ${gapVersion}`,
    schema,
    version,
    gapVersion,
  });

export class UnrepresentableFieldError extends Error {
  constructor(
    readonly schema: string,
    readonly version: string,
    readonly path: string,
    readonly reason: 'type' | 'check',
    readonly detail: string,
  ) {
    super(
      `${schema} ${version}: field "${path}" cannot be captured by a Snapshot: ${detail}. A field's encoded side must be a struct, string, number, boolean, null, literal, union, array, string-keyed record, enum, or nested ESchema; a conversion such as Schema.DateFromString is allowed when its encoded side is one. Each check must be a built-in catalogue check or named with checkAnnotation.`,
    );
    this.name = 'UnrepresentableFieldError';
  }
}

const versionNumber = (version: string) => {
  const match = /^v(\d+)$/.exec(version);
  return match === null ? undefined : Number(match[1]);
};

export const unknownVersion = (
  schema: string,
  version: string,
  latestVersion: string,
): ESchemaError | OutdatedVersion => {
  const received = versionNumber(version);
  const latest = versionNumber(latestVersion);
  const message = `Unknown schema version: ${version}`;
  return received !== undefined && latest !== undefined && received > latest
    ? new OutdatedVersion({ message, schema, version, latestVersion })
    : new ESchemaError({ message });
};

const hasTag =
  <T>(tag: string) =>
  (value: unknown): value is T =>
    value !== null &&
    typeof value === 'object' &&
    (value as { readonly _tag?: unknown })._tag === tag;

const findTagged = <T>(
  error: unknown,
  matches: (value: unknown) => value is T,
): T | undefined => {
  const seen = new Set<object>();
  const pending: unknown[] = [error];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === null || typeof next !== 'object' || seen.has(next)) continue;
    seen.add(next);
    if (matches(next)) return next;
    pending.push(...Object.values(next));
    if (next instanceof Error && next.cause !== undefined)
      pending.push(next.cause);
  }
  return undefined;
};

export const findOutdatedVersion = (
  error: unknown,
): OutdatedVersion | undefined =>
  findTagged(error, hasTag<OutdatedVersion>('OutdatedVersion'));

export const findNeedsBackfill = (error: unknown): NeedsBackfill | undefined =>
  findTagged(error, hasTag<NeedsBackfill>('NeedsBackfill'));

/** The error a read raises; a gap or a newer version is told apart. */
export type ReadError = ESchemaError | OutdatedVersion | NeedsBackfill;

/**
 * What a schema issue says about a failed read or write. It carries an
 * `OutdatedVersion` or `NeedsBackfill`, so `findOutdatedVersion` and
 * `findNeedsBackfill` find it inside an Effect Schema error.
 */
export const issueOf = (error: ReadError) =>
  error._tag === 'OutdatedVersion'
    ? { message: error.message, outdatedVersion: error }
    : error._tag === 'NeedsBackfill'
      ? { message: error.message, needsBackfill: error }
      : { message: error.message };
