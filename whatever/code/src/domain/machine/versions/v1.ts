import { Schema } from 'effect';

export const MachineV1 = {
  name: Schema.NullOr(Schema.String),
  hostname: Schema.String,
};
