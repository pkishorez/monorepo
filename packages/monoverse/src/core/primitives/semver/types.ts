import { Data } from 'effect';

export class InvalidSemverRangeError extends Data.TaggedError(
  'InvalidSemverRangeError',
)<{
  raw: string;
}> {}
