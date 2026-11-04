import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/schema';

const v1 = {
  boardId: Schema.String,
  title: Schema.String,
  // An early release kept the estimate as whatever text was typed.
  estimate: Schema.String,
};

// v2 makes it a number of hours. This migration expects digits only.
export const Forgetful = EntityESchema.make('Task', 'taskId', v1)
  .evolve('v2', { estimate: Schema.Finite }, (v1) => {
    const hours = Number(v1.estimate);
    if (Number.isNaN(hours)) throw new Error(`not a number: ${v1.estimate}`);
    return { ...v1, estimate: hours };
  })
  .build();

// The fix: text that isn't a number becomes "no estimate".
export const Fixed = EntityESchema.make('Task', 'taskId', v1)
  .evolve('v2', { estimate: Schema.NullOr(Schema.Finite) }, (v1) => {
    const hours = Number(v1.estimate);
    return { ...v1, estimate: Number.isFinite(hours) ? hours : null };
  })
  .build();
