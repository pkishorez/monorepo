import { Schema } from 'effect';
import { EntityESchema, ESchema } from 'std-toolkit/eschema';
import type { Entry } from '@pkishorez/flow';

/**
 * How the DevTools Flow Store keeps one Entry: keyed by the Entry id, indexed
 * by Flow id, stamped by the store's own monotonic `_u` on write. The browser
 * syncs these rows into a collection and derives Journals from them.
 */
export const FlowEntryEntitySchema = EntityESchema.make('FlowEntry', 'id', {
  flowId: Schema.String,
  entry: ESchema.fromType<Entry>(),
}).build();

export type FlowEntryRecord = typeof FlowEntryEntitySchema.Type;
