import type { Message, RunStatus, Thread } from './agent-rpc.js';

export const statusOf = (messages: ReadonlyArray<Message>): RunStatus =>
  messages.findLast((message) => message._tag === 'Status')?.status ??
  'running';

export const threadOf = (
  thread: Omit<Thread, 'title' | 'status'>,
  messages: ReadonlyArray<Message>,
): Thread => ({
  ...thread,
  title: messages.find((message) => message._tag === 'User')?.text ?? '',
  status: statusOf(messages),
});
