export type WriteError =
  | { _tag: 'WrongEntity'; expected: string; received: string }
  | { _tag: 'MissingId'; entity: unknown }
  | { _tag: 'Invalid'; reason: string }
  | { _tag: 'Storage'; reason: string; cause?: unknown };

/** Constructs the `Storage` variant of {@link WriteError} from a failed Sync Store operation. */
export const storageError = (reason: string, cause: unknown): WriteError => ({
  _tag: 'Storage',
  reason,
  cause,
});
