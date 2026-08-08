import { EntityESchema } from 'std-toolkit/eschema';
import { MachineV1 } from './versions/v1.js';

export const MachineSchema = EntityESchema.make(
  'Machine',
  'machineId',
  MachineV1,
).build();
