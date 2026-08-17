import { Data } from 'effect';

export class ContractEntryError extends Data.TaggedError('ContractEntryError')<{
  readonly reason: 'import' | 'export';
  readonly filePath: string;
  readonly cause: unknown;
}> {}
