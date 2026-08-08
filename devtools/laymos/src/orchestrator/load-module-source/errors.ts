import { Data } from 'effect';

export class ModuleSourceNotFound extends Data.TaggedError(
  'ModuleSourceNotFound',
)<{
  readonly modulePath: string;
}> {}

export class ModuleSourceReadError extends Data.TaggedError(
  'ModuleSourceReadError',
)<{
  readonly filePath: string;
  readonly cause: unknown;
}> {}
