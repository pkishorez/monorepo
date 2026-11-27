import { Context, type Effect } from 'effect';
import type { HarnessAccount, HarnessError } from '@kestack/ai-toolkit/harness';

/*
 * The Harness Account each harness call runs as, found by its id: a
 * Session's calls run as the Session's, a Title's as Codex's Default
 * Account. Read afresh on every call, so a change applies to the next
 * process a harness starts. The implementation is services/harness-accounts/.
 */
export class HarnessAccounts extends Context.Service<
  HarnessAccounts,
  {
    /** What a harness call as account `id` runs; a HarnessError once it is removed. */
    readonly as: (
      id: string,
    ) => Effect.Effect<HarnessAccount['Service'], HarnessError>;
  }
>()('@kestack/connect/engine/HarnessAccounts') {}
