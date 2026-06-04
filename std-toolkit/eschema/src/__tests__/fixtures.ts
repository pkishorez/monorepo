import { Schema, SchemaTransformation } from 'effect';

export const StringToNumber = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: (val) => parseInt(val),
      encode: (val) => String(val),
    }),
  ),
);

export const StringToBoolean = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Boolean,
    SchemaTransformation.transform({
      decode: (val) => val === 'true',
      encode: (val) => String(val),
    }),
  ),
);
