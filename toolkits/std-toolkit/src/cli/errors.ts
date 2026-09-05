import { PlatformError } from 'effect';
import {
  SnapshotDecodeError,
  SnapshotFormatRetired,
} from '../snapshot/index.js';
import { ContractEntryError, entryFileName } from './contract-files/index.js';

export function renderOperationalError(error: unknown): string {
  if (error instanceof ContractEntryError) {
    return error.reason === 'export'
      ? `${entryFileName} must default-export a snapshot`
      : `Could not load ${entryFileName}: ${error.filePath}`;
  }
  if (error instanceof SnapshotFormatRetired) return error.message;
  if (error instanceof SnapshotDecodeError) return error.message;
  if (error instanceof PlatformError.PlatformError) {
    return `Could not access the snapshot baseline: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
