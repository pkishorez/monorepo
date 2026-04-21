import { Schema } from 'effect';

export const StringToNumber = Schema.transform(Schema.String, Schema.Number, {
  decode: (val) => parseInt(val),
  encode: (val) => String(val),
});
