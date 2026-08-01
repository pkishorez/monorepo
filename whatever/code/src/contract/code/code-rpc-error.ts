import { Schema } from 'effect';

export class CodeRpcError extends Schema.TaggedErrorClass<CodeRpcError>(
  'CodeRpcError',
)('CodeRpcError', {
  code: Schema.String,
  message: Schema.String,
}) {}
