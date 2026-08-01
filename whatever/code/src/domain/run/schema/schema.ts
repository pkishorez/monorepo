import { EntityESchema } from 'std-toolkit/eschema';
import { RunV1 } from './v1.js';

export const RunSchema = EntityESchema.make('Run', 'runId', RunV1).build();

export type Run = typeof RunSchema.Type;
