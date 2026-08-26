import type { ESchemaDefinition, ESchemaSnapshot } from '../domain/index.js';
import { captureESchema } from '../capture/eschema-capture/index.js';
import {
  restoreESchemaDefinitions,
  type RestoredESchema,
} from '../restore/eschema-restore/index.js';
import { decodeSnapshot } from './snapshot-decoder/index.js';
import { diffSnapshot } from './snapshot-diff/index.js';
import { inspectSnapshot } from './snapshot-inspector/index.js';
import {
  renderSnapshot,
  renderSnapshotChanges,
} from './snapshot-renderer/index.js';
import { inspectESchema } from '../../eschema/domain/introspection/index.js';
import type { AnyEvolvingSchema } from '../../eschema/domain/schema-model/index.js';

function capture(eschema: AnyEvolvingSchema): ESchemaSnapshot {
  return captureESchema(eschema, inspectESchema(eschema).name);
}

function restore(
  definitions: readonly ESchemaDefinition[],
): readonly RestoredESchema[] {
  return restoreESchemaDefinitions(definitions);
}

export const Snapshot = {
  capture,
  decode: decodeSnapshot,
  restore,
  inspect: inspectSnapshot,
  diff: diffSnapshot,
  render: renderSnapshot,
  renderChanges: renderSnapshotChanges,
} as const;
