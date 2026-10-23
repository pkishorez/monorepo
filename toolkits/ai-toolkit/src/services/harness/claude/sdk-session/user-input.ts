import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/** The user messages fed to the query, one at a time, as they are pushed. */
export const userInput = () => {
  const waiting: SDKUserMessage[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  const iterable = async function* (): AsyncGenerator<SDKUserMessage> {
    while (!closed) {
      const next = waiting.shift();
      if (next !== undefined) yield next;
      else await new Promise<void>((resolve) => (wake = resolve));
    }
  };
  const poke = () => {
    wake?.();
    wake = undefined;
  };
  return {
    iterable: iterable(),
    push: (
      uuid: string,
      content: SDKUserMessage['message']['content'],
    ): void => {
      waiting.push({
        type: 'user',
        message: { role: 'user', content },
        parent_tool_use_id: null,
        // `next` folds the message into the running turn at its next tool
        // boundary; `now` would abort the turn's work in flight.
        priority: 'next',
        uuid: uuid as SDKUserMessage['uuid'] & string,
      });
      poke();
    },
    close: () => {
      closed = true;
      poke();
    },
  };
};
