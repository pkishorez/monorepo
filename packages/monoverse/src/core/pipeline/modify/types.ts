import { Data } from 'effect';

export class ModifyError extends Data.TaggedError('ModifyError')<{
  workspace: string;
  message: string;
  cause: unknown;
}> {}

export class DependencyNotFoundError extends Data.TaggedError(
  'DependencyNotFoundError',
)<{
  workspace: string;
  dependencyName: string;
}> {}

export class PackageJsonParseError extends Data.TaggedError(
  'PackageJsonParseError',
)<{
  workspace: string;
  cause: unknown;
}> {}

export class PackageJsonWriteError extends Data.TaggedError(
  'PackageJsonWriteError',
)<{
  workspace: string;
  cause: unknown;
}> {}
