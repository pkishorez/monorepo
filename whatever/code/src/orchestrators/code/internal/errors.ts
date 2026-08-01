import { GitError } from '../../../services/git/index.js';

export class CodeError {
  readonly _tag = 'CodeError';
  constructor(
    readonly code: string,
    readonly message: string,
  ) {}
}

export const toCodeError = (error: unknown): CodeError => {
  if (error instanceof CodeError) return error;
  if (error instanceof GitError)
    return new CodeError(error.code, error.message);
  return new CodeError(
    'internal_error',
    error instanceof Error ? error.message : String(error),
  );
};
