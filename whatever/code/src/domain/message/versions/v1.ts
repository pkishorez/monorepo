import type { UIMessage } from '@tanstack/ai';
import { fromType, id } from 'std-toolkit/eschema';

export const MessageV1 = {
  threadId: id('ThreadId'),
  runId: id('RunId'),
  payload: fromType<UIMessage>(),
};
