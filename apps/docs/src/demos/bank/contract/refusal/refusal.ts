import { Schema } from 'effect';

export const TRANSFER_REFUSAL_REASONS = [
  'invalid-amount',
  'same-account',
  'insufficient-funds',
  'account-not-found',
] as const;

export type TransferRefusalReason = (typeof TRANSFER_REFUSAL_REASONS)[number];

export class TransferRefused extends Schema.TaggedError<TransferRefused>()(
  'TransferRefused',
  { reason: Schema.Literals(TRANSFER_REFUSAL_REASONS) },
) {}
