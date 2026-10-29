import type { Effect } from 'effect';
import type { ESchemaError, ReadError } from '../eschema-error/index.js';
import type { AnyESchema, AnyEvolvingSchema } from '../schema-model/index.js';

/** A value at one version of its ESchema, as a Backfill runner holds it. */
export interface VersionedValue {
  readonly version: string;
  readonly value: unknown;
}

interface EncodedCodec {
  readonly read: (value: unknown) => Effect.Effect<unknown, ReadError>;
  readonly write: (value: never) => Effect.Effect<unknown, ESchemaError>;
}

// The steps a Backfill runner takes between gap versions; object ESchemas only.
interface GapSteps {
  readonly readToGap: (
    value: unknown,
  ) => Effect.Effect<VersionedValue, ReadError>;
  readonly migrateToGap: (
    version: string,
    value: unknown,
  ) => Effect.Effect<VersionedValue, ESchemaError>;
}

const codecs = new WeakMap<object, EncodedCodec>();
const gapSteps = new WeakMap<object, GapSteps>();

export const registerEncoded = (eschema: object, codec: EncodedCodec): void => {
  codecs.set(eschema, codec);
};

export const registerGapSteps = (eschema: object, steps: GapSteps): void => {
  gapSteps.set(eschema, steps);
};

const codecOf = (eschema: object): EncodedCodec => {
  const codec = codecs.get(eschema);
  if (codec === undefined) throw new TypeError('Not an ESchema');
  return codec;
};

const gapStepsOf = (eschema: object): GapSteps => {
  const steps = gapSteps.get(eschema);
  if (steps === undefined) throw new TypeError('Not an object ESchema');
  return steps;
};

export const readEncoded = <S extends AnyEvolvingSchema>(
  eschema: S,
  value: unknown,
) => codecOf(eschema).read(value) as Effect.Effect<S['Type'], ReadError>;

export const writeEncoded = <S extends AnyEvolvingSchema>(
  eschema: S,
  value: S['Type'],
) =>
  codecOf(eschema).write(value as never) as Effect.Effect<
    S['Encoded'],
    ESchemaError
  >;

/**
 * Reads an encoded form at its stored version and migrates it up to, but not
 * across, the next gap version: the value at the version just before the gap,
 * or at the latest when no gap is left. A version the schema does not know
 * fails as a read does.
 */
export const readToGap = (
  eschema: AnyESchema,
  value: unknown,
): Effect.Effect<VersionedValue, ReadError> =>
  gapStepsOf(eschema).readToGap(value);

/**
 * Checks a value at `version` against that version's fields and runs the
 * migrations after it, up to the next gap version or the latest. A Backfill
 * runner calls it on what a Backfill returned for a gap version.
 */
export const migrateToGap = (
  eschema: AnyESchema,
  version: string,
  value: unknown,
): Effect.Effect<VersionedValue, ESchemaError> =>
  gapStepsOf(eschema).migrateToGap(version, value);
