import { Schema } from 'effect';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../table/index.js';

const table = StdTable.make('write-options').primary('pk', 'sk').build();
const schema = EntityESchema.make('Probe', 'probeId', {
  n: Schema.Number,
}).build();
const probe = table.entity(schema).primary().build();
const key = { probeId: 'a' };

// An entity invariant, or a last-write-wins clobber, but never both: the
// invariant judges a value that only the `_u` condition still holds.
probe.getAndUpdateOp(key, { n: 1 }, { check: (current) => current.n > 0 });
probe.getAndUpdateOp(key, { n: 1 }, { lastWriteWins: true });
probe.deleteOp(key, { check: (current) => current.n > 0 });
probe.deleteOp(key, { lastWriteWins: true });

type Assert<T extends false> = T;
type Options = NonNullable<Parameters<typeof probe.getAndUpdateOp>[2]>;
type Both = {
  readonly check: (current: { readonly n: number }) => boolean;
  readonly lastWriteWins: true;
};

// Fails to compile the moment the pair becomes assignable again.
export type BothRejected = Assert<Both extends Options ? true : false>;
