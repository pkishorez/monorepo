import { Schema } from 'effect';
import type { TableSnapshot } from '../../domain/index.js';
import {
  SnapshotDecodeError,
  TableSnapshotSchema,
} from '../../domain/index.js';
import {
  decodeSnapshotDocument,
  describeDecodeFailure,
  retiredTableSnapshot,
} from './snapshot-document.js';

function validateTableSnapshot(input: unknown): TableSnapshot {
  const retired = retiredTableSnapshot(input);
  if (retired !== null) throw retired;
  try {
    return Schema.decodeUnknownSync(TableSnapshotSchema)(input);
  } catch (cause) {
    throw new SnapshotDecodeError(
      `Malformed table snapshot: ${describeDecodeFailure(cause)}`,
      cause,
    );
  }
}

export { decodeSnapshotDocument as decodeSnapshot, validateTableSnapshot };
