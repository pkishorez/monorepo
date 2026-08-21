import { Match } from 'effect';
import type { TransferRefusalReason } from '../../contract/refusal/index.ts';

export interface Problem {
  readonly kind: 'refusal' | 'failure';
  readonly message: string;
}

interface Tagged {
  readonly _tag: string;
  readonly reason?: string;
}

const taggedCause = (error: unknown): Tagged => {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current !== null; depth += 1) {
    if (typeof current === 'object' && '_tag' in (current as object))
      return current as Tagged;
    current = (current as { cause?: unknown } | null)?.cause ?? null;
  }
  return { _tag: 'Unknown' };
};

const refusalText = (reason: string | undefined): string =>
  Match.value(reason as TransferRefusalReason).pipe(
    Match.when('insufficient-funds', () => 'Not enough funds.'),
    Match.when('same-account', () => 'Cannot pay itself.'),
    Match.when('account-not-found', () => 'No such account.'),
    Match.orElse(() => 'Amount must be a whole number.'),
  );

export const explain = (error: unknown): Problem =>
  Match.value(taggedCause(error)).pipe(
    Match.when({ _tag: 'TransferRefused' }, (refused) => ({
      kind: 'refusal' as const,
      message: refusalText(refused.reason),
    })),
    Match.when({ _tag: 'InvalidName' }, () => ({
      kind: 'refusal' as const,
      message: 'Name is empty or too long.',
    })),
    Match.orElse(() => ({
      kind: 'failure' as const,
      message: 'Never reached the bank.',
    })),
  );
