import { Context, type Effect } from 'effect';
import type { TurnEndStatus } from '../../../../projection/index.js';
import type {
  Harness,
  HarnessError,
  HarnessSession,
} from '../../../../harness/index.js';

/** What a Turn tells the Session that runs it. */
export type TurnReport =
  | {
      readonly _tag: 'TurnEnded';
      readonly turnId: string;
      readonly status: TurnEndStatus;
    }
  | { readonly _tag: 'NativeId'; readonly nativeId: string };

/** What the Session hands every Turn it runs. */
export class TurnContext extends Context.Service<
  TurnContext,
  {
    readonly harness: Harness;
    /** The Session's live agent, opened on first use and shared by its Turns. */
    readonly agent: Effect.Effect<HarnessSession, HarnessError>;
    /** The agent if it is open now, without opening it. */
    readonly opened: Effect.Effect<HarnessSession | undefined>;
    /** Closes the agent; the next Turn opens it again, resumed by its native id. */
    readonly reset: Effect.Effect<void>;
    readonly report: (report: TurnReport) => Effect.Effect<void>;
  }
>()('@kestack/ai-toolkit/engine/TurnContext') {}
