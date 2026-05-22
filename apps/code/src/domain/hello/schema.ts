import { Schema } from 'effect';

export class HelloMessage extends Schema.Class<HelloMessage>('HelloMessage')({
  message: Schema.String,
  timestamp: Schema.Number,
}) {}
