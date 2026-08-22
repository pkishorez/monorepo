import { Schema } from 'effect';
import { ESchema } from 'std-toolkit/eschema';
import { bankTable } from '../../table/index.ts';

const GenerationSchema = ESchema.make('generation', {
  value: Schema.Int,
}).build();

export const generationEntity = bankTable
  .singleEntity(GenerationSchema)
  .default({ value: 0 });
