import type { RequestId } from "./generated/RequestId.js";
import type { QuestionItem } from "../../core/entity/turn/turn.js";
import type { OnExecuteStatusUpdate } from "../workflow/schema.js";

export interface PendingUserInput {
  jsonRpcId: RequestId;
  /** Original Codex question IDs, preserved for answer mapping back. */
  codexQuestionIds: string[];
  /** Converted questions stored for answer conversion. */
  questions: ReadonlyArray<typeof QuestionItem.Type>;
}

export interface ActiveTurn {
  turnId: string;
  sdkTurnId: string | null;
  /** Pending user-input requests, keyed by our server-generated requestId. */
  pendingUserInputs: Map<string, PendingUserInput>;
  /** Optional callback to push status updates into the workflow entity. */
  onStatusUpdate?: OnExecuteStatusUpdate;
}
