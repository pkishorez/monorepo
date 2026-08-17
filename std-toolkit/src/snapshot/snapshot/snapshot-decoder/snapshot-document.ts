import { Effect, Schema } from 'effect';
import {
  ESchemaSnapshotSchema,
  SnapshotDecodeError,
  SnapshotFormatRetired,
  TableSnapshotSchema,
} from '../../domain/index.js';
import type { ContractSnapshot } from '../../domain/index.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const describeDecodeFailure = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export const retiredTableSnapshot = (
  input: unknown,
): SnapshotFormatRetired | null => {
  if (!isRecord(input) || input.kind !== 'table') return null;
  if (
    input._v === undefined ||
    input._v === TableSnapshotSchema.fields._v.literal
  )
    return null;
  return new SnapshotFormatRetired(input._v);
};

export function decodeSnapshotDocument(
  input: unknown,
): Effect.Effect<ContractSnapshot, SnapshotDecodeError> {
  const retired = retiredTableSnapshot(input);
  if (retired !== null) return Effect.fail(retired);
  const kind = isRecord(input) ? input.kind : undefined;
  if (kind !== 'eschema' && kind !== 'table') {
    return Effect.fail(
      new SnapshotDecodeError(
        `Malformed snapshot: expected kind "eschema" or "table", got ${JSON.stringify(kind)}`,
      ),
    );
  }
  const decode: Effect.Effect<ContractSnapshot, Schema.SchemaError> =
    kind === 'eschema'
      ? Schema.decodeUnknownEffect(ESchemaSnapshotSchema)(input)
      : Schema.decodeUnknownEffect(TableSnapshotSchema)(input);
  return decode.pipe(
    Effect.mapError(
      (cause) =>
        new SnapshotDecodeError(
          `Malformed snapshot: ${describeDecodeFailure(cause)}`,
          cause,
        ),
    ),
  );
}
