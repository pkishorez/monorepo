import type { ServerNotification } from "./generated/ServerNotification.js";
import type { QuestionItem } from "../../core/entity/turn/turn.js";

export type CodexRequestUserInputEvent = {
  method: "item/tool/requestUserInput";
  params: {
    threadId: string;
    turnId: string;
    itemId: string;
    questions: Array<typeof QuestionItem.Type>;
  };
};

export type CodexEventSource = ServerNotification | CodexRequestUserInputEvent;
