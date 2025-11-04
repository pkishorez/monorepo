import { Data } from 'effect';

export class ESchemaParseError extends Data.TaggedError('eschema/ParseError')<{
  msg?: string;
}> {}
