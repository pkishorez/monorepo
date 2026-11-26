import {
  deleteSession,
  getSessionInfo,
  getSessionMessages,
  getSubagentMessages,
  listSessions,
  listSubagents,
  query,
  renameSession,
  tagSession,
  type Query,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { Effect, Layer, Stream } from 'effect';
import { ClaudeError } from '../contract/index.js';
import { ClaudeDriver, type Connection, type Driver } from '../shared/index.js';

const input = () => {
  const waiting: Array<SDKUserMessage> = [];
  let wake: (() => void) | undefined;
  let closed = false;
  const poke = () => {
    wake?.();
    wake = undefined;
  };
  const iterable = async function* () {
    while (!closed) {
      const next = waiting.shift();
      if (next !== undefined) yield next;
      else await new Promise<void>((resolve) => (wake = resolve));
    }
  };
  return {
    iterable: iterable(),
    write: (message: SDKUserMessage) => {
      waiting.push(message);
      poke();
    },
    close: () => {
      closed = true;
      poke();
    },
  };
};

const connect = (live: Query, write: Connection['write']): Connection => {
  const interrupt: (options: {
    readonly cancelQueued: boolean;
  }) => Promise<unknown> = live.interrupt.bind(live);
  return {
    messages: Stream.fromAsyncIterable(
      live,
      (cause) => new ClaudeError({ message: 'Claude Code exited', cause }),
    ),
    write,
    control: {
      initializationResult: live.initializationResult.bind(live),
      getContextUsage: live.getContextUsage.bind(live),
      mcpServerStatus: live.mcpServerStatus.bind(live),
      setModel: live.setModel.bind(live),
      setPermissionMode: live.setPermissionMode.bind(live),
      applyFlagSettings: live.applyFlagSettings.bind(live),
      interrupt: () => interrupt({ cancelQueued: true }),
    },
  };
};

export const realDriver: Driver = {
  open: (options) =>
    options.pathToClaudeCodeExecutable === undefined
      ? Effect.fail(
          new ClaudeError({
            message:
              'Claude Code is not installed: install it from https://claude.com/claude-code, then sign in',
          }),
        )
      : Effect.acquireRelease(
          Effect.try({
            try: () => {
              const prompt = input();
              return {
                prompt,
                live: query({ prompt: prompt.iterable, options }),
              };
            },
            catch: (cause) =>
              new ClaudeError({ message: 'Claude Code did not start', cause }),
          }),
          ({ prompt, live }) =>
            Effect.sync(() => {
              prompt.close();
              live.close();
            }),
        ).pipe(Effect.map(({ prompt, live }) => connect(live, prompt.write))),
  sessions: {
    listSessions,
    getSessionInfo,
    getSessionMessages,
    listSubagents,
    getSubagentMessages,
    renameSession,
    tagSession,
    deleteSession,
  },
};

export const layerReal = Layer.succeed(ClaudeDriver, realDriver);
