import { failureReason, HarnessError } from '../contract/index.js';
import type {
  Notifications,
  ThreadItem,
  TokenUsageBreakdown,
  UserInputRequest,
} from '../codex/app-server/index.js';
import {
  QUESTION_ANSWERED,
  QUESTION_ASKED,
  TEXT_CHUNK,
  type QuestionAnswered,
} from '../codex/record-kinds/index.js';
import { CODEX } from './catalog.js';
import type { ToolStep, Writer, WriterContext } from './writer.js';
import { recordOf } from './writer.js';

/*
 * Codex's records, as `codex app-server` notifies them and the harness
 * keeps them (`../codex/thread`): each tool an `item/started` then its
 * `item/completed`; `text.chunk`s then the `agentMessage` or `reasoning`
 * item pointing at them; a plan `turn/plan/updated`; a subagent a
 * `spawnAgent` call whose thread's records carry its id and end with its
 * own `turn/completed`; an Agent Question the harness's own
 * `question.asked` and `question.answered`; and the turn's token usage,
 * then `turn/completed`. Typed by the app-server's protocol, and shaped
 * after the fixtures recorded from Codex (`../codex/project/tests/fixtures`).
 */

type Item = ThreadItem;
type Payload<M extends keyof Notifications> = Notifications[M];

const absolute = (cwd: string, path: string) =>
  path.startsWith('/') ? path : `${cwd}/${path}`;

/** A command as Codex runs it, in the user's login shell. */
const shell = (command: string) =>
  `/bin/zsh -lc '${command.replaceAll("'", `'\\''`)}'`;

const tokens = (usage: {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
}): TokenUsageBreakdown => ({
  totalTokens: usage.input + usage.cacheRead + usage.output,
  inputTokens: usage.input + usage.cacheRead,
  cachedInputTokens: usage.cacheRead,
  cacheWriteInputTokens: 0,
  outputTokens: usage.output,
  reasoningOutputTokens: 0,
});

const diffOf = (before: string, after: string) =>
  [
    '@@ -1 +1 @@',
    ...before.split('\n').map((line) => `-${line}`),
    ...after.split('\n').map((line) => `+${line}`),
  ].join('\n');

export const codexWriter = (context: WriterContext): Writer => {
  const { nativeId: threadId, turnId, cwd, model, agentId, id } = context;
  const record = (kind: string, payload: unknown) =>
    recordOf(kind, payload, agentId);
  const item = (kind: 'item/started' | 'item/completed', value: Item) =>
    record(kind, {
      threadId,
      turnId,
      item: value,
    } satisfies Payload<'item/started'>);

  const command = (
    text: string,
    output: string,
    fails: string | undefined,
  ): { started: Item; completed: Item } => {
    const base = {
      type: 'commandExecution' as const,
      id: id('exec-'),
      command: shell(text),
      cwd,
      processId: null,
    };
    return {
      started: {
        ...base,
        status: 'inProgress',
        aggregatedOutput: null,
        exitCode: null,
      },
      completed: {
        ...base,
        status: fails === undefined ? 'completed' : 'failed',
        aggregatedOutput: fails ?? output,
        exitCode: fails === undefined ? 0 : 1,
      },
    };
  };

  const fileChange = (
    changes: ReadonlyArray<{
      readonly path: string;
      readonly kind: 'add' | 'delete' | 'update';
      readonly diff: string;
    }>,
    fails: string | undefined,
  ): { started: Item; completed: Item } => {
    const base = {
      type: 'fileChange' as const,
      id: id('exec-'),
      changes: changes.map((change) => ({
        path: absolute(cwd, change.path),
        kind:
          change.kind === 'update'
            ? { type: 'update' as const, move_path: null }
            : { type: change.kind },
        diff: change.diff,
      })),
    };
    return {
      started: { ...base, status: 'inProgress' },
      completed: {
        ...base,
        status: fails === undefined ? 'completed' : 'failed',
      },
    };
  };

  const items = (step: ToolStep): { started: Item; completed: Item } => {
    switch (step._tag) {
      case 'Read': {
        if (step.images !== undefined) {
          const view: Item = {
            type: 'imageView',
            id: id('exec-'),
            path: absolute(cwd, step.path),
          };
          return { started: view, completed: view };
        }
        return command(`sed -n '1,200p' ${step.path}`, step.text, step.fails);
      }
      case 'Write':
        return fileChange(
          [
            {
              path: step.path,
              kind: 'add',
              diff: step.content
                .split('\n')
                .map((line) => `+${line}`)
                .join('\n'),
            },
          ],
          step.fails,
        );
      case 'Edit':
        return fileChange(
          [
            {
              path: step.path,
              kind: 'update',
              diff: diffOf(step.before, step.after),
            },
          ],
          step.fails,
        );
      case 'Delete':
        return fileChange(
          [{ path: step.path, kind: 'delete', diff: '' }],
          step.fails,
        );
      case 'Bash':
        return command(step.command, step.output, step.fails);
      case 'Search':
        return command(
          `rg -n '${step.pattern}' ${step.path}`,
          step.output,
          step.fails,
        );
      case 'Web': {
        const search: Item = {
          type: 'webSearch',
          id: id('ws_'),
          query: step.query,
          action: { type: 'search', query: step.query },
        };
        return { started: search, completed: search };
      }
      case 'Mcp': {
        const base = {
          type: 'mcpToolCall' as const,
          id: id('call_'),
          server: step.server,
          tool: step.tool,
          arguments: step.input,
        };
        return {
          started: { ...base, status: 'inProgress', result: null, error: null },
          completed:
            step.fails === undefined
              ? {
                  ...base,
                  status: 'completed',
                  result: { content: [{ type: 'text', text: step.output }] },
                  error: null,
                }
              : {
                  ...base,
                  status: 'failed',
                  result: null,
                  error: { message: step.fails },
                },
        };
      }
      case 'Other': {
        const base = {
          type: 'dynamicToolCall' as const,
          id: id('call_'),
          tool: step.name,
          arguments: { description: step.description },
        };
        return {
          started: {
            ...base,
            status: 'inProgress',
            contentItems: null,
            success: null,
          },
          completed: {
            ...base,
            status: step.fails === undefined ? 'completed' : 'failed',
            contentItems: [
              { type: 'inputText', text: step.fails ?? step.output },
            ],
            success: step.fails === undefined,
          },
        };
      }
    }
  };

  const spawn = (
    prompt: string,
    child: string,
    status: 'inProgress' | 'completed',
  ): Item => ({
    type: 'collabAgentToolCall',
    id: '',
    tool: 'spawnAgent',
    status,
    senderThreadId: threadId,
    receiverThreadIds: [child],
    prompt,
    model,
    agentsStates:
      status === 'inProgress'
        ? {}
        : { [child]: { status: 'pendingInit', message: null } },
  });

  const writer: Writer = {
    opens: () => [],
    text: (channel, pieces) => {
      const itemId = id(channel === 'text' ? 'msg_fake' : 'rs_fake');
      return {
        chunks: pieces.map((text) =>
          record(TEXT_CHUNK, { streamId: itemId, channel, text }),
        ),
        whole: [
          item(
            'item/completed',
            channel === 'text'
              ? {
                  type: 'agentMessage',
                  id: itemId,
                  text: { $stream: itemId } as never,
                  phase: 'final_answer',
                }
              : { type: 'reasoning', id: itemId, summary: [], content: [] },
          ),
        ],
      };
    },
    tool: (step) => {
      const { started, completed } = items(step);
      return {
        call: [item('item/started', started)],
        result: [item('item/completed', completed)],
      };
    },
    plan: (step) => [
      record('turn/plan/updated', {
        threadId,
        turnId,
        explanation: null,
        plan: step.items.map(({ step: text, status }) => ({
          step: text,
          status: status === 'in_progress' ? 'inProgress' : status,
        })),
      } satisfies Payload<'turn/plan/updated'>),
    ],
    subagent: (step) => {
      const callId = id('exec-');
      const child = id('thread-');
      const childTurn = id('turn-');
      const childWriter = codexWriter({
        ...context,
        nativeId: child,
        turnId: childTurn,
        agentId: callId,
      });
      return {
        call: [
          item('item/started', {
            ...spawn(step.prompt, child, 'inProgress'),
            id: callId,
          }),
          item('item/completed', {
            ...spawn(step.prompt, child, 'completed'),
            id: callId,
          }),
          recordOf(
            'item/completed',
            {
              threadId: child,
              turnId: childTurn,
              item: {
                type: 'userMessage',
                id: id('user-'),
                content: [{ type: 'text', text: step.prompt }],
              },
            },
            callId,
          ),
        ],
        child: childWriter,
        report: () => {
          const report: Item = {
            type: 'agentMessage',
            id: id('msg_fake'),
            text: step.report,
            phase: 'final_answer',
          };
          return [
            recordOf(
              'item/completed',
              { threadId: child, turnId: childTurn, item: report },
              callId,
            ),
            recordOf(
              'turn/completed',
              {
                threadId: child,
                turn: {
                  id: childTurn,
                  items: [report],
                  status: 'completed',
                  error: null,
                },
              } satisfies Payload<'turn/completed'>,
              callId,
            ),
          ];
        },
      };
    },
    ask: (step, now) => {
      const request: UserInputRequest = {
        threadId,
        turnId,
        itemId: id('call_'),
        questions: step.items.map((each, index) => ({
          id: `q${index}`,
          header: each.header,
          question: each.question,
          isOther: true,
          isSecret: each.secret === true,
          options: each.options.length === 0 ? null : each.options,
        })),
      };
      const headers = Object.fromEntries(
        request.questions.map(({ id: question, header }) => [question, header]),
      );
      const secrets = new Set(
        request.questions
          .filter(({ isSecret }) => isSecret)
          .map(({ id: question }) => question),
      );
      return {
        question: {
          id: request.itemId,
          items: request.questions.map((each) => ({
            id: each.id,
            header: each.header,
            question: each.question,
            options: each.options ?? [],
            // Codex asks for one choice, or an answer typed instead.
            multiSelect: false,
            other: each.isOther,
            secret: each.isSecret,
          })),
          askedAt: now,
        },
        records: [record(QUESTION_ASKED, request)],
        answered: (answer) => [
          record(QUESTION_ANSWERED, {
            threadId,
            turnId,
            itemId: request.itemId,
            headers,
            // A secret's answer is never written down.
            answers:
              answer === null
                ? null
                : Object.fromEntries(
                    Object.entries(answer).map(([question, chosen]) => [
                      question,
                      secrets.has(question) ? ['(hidden)'] : chosen,
                    ]),
                  ),
          } satisfies QuestionAnswered),
        ],
      };
    },
    job: (step) => {
      if (step.kind === 'shell') {
        const processId = id('');
        const base = {
          type: 'commandExecution' as const,
          id: id('exec-'),
          command: shell(step.title),
          cwd,
          processId,
        };
        return {
          id: processId,
          toolCallId: base.id,
          records: [
            item('item/started', {
              ...base,
              status: 'inProgress',
              aggregatedOutput: null,
              exitCode: null,
            }),
          ],
          ended: (how, summary, output) => [
            item('item/completed', {
              ...base,
              status: how === 'done' ? 'completed' : 'failed',
              aggregatedOutput: output || summary,
              exitCode: how === 'done' ? 0 : how === 'failed' ? 1 : 143,
            }),
          ],
        };
      }
      const callId = id('exec-');
      const child = id('thread-');
      const childTurn = id('turn-');
      return {
        id: child,
        toolCallId: callId,
        records: [
          item('item/started', {
            ...spawn(step.title, child, 'inProgress'),
            id: callId,
          }),
          item('item/completed', {
            ...spawn(step.title, child, 'completed'),
            id: callId,
          }),
        ],
        ended: (how, summary) => {
          const report: Item = {
            type: 'agentMessage',
            id: id('msg_fake'),
            text: summary,
            phase: 'final_answer',
          };
          return [
            recordOf(
              'turn/completed',
              {
                threadId: child,
                turn: {
                  id: childTurn,
                  items: summary === '' ? [] : [report],
                  status:
                    how === 'done'
                      ? 'completed'
                      : how === 'failed'
                        ? 'failed'
                        : 'interrupted',
                  error:
                    how === 'failed'
                      ? {
                          message: summary || 'The sub-agent failed',
                          additionalDetails: null,
                        }
                      : null,
                },
              } satisfies Payload<'turn/completed'>,
              callId,
            ),
          ];
        },
      };
    },
    compact: () => [
      item('item/completed', { type: 'contextCompaction', id: id('cc_') }),
    ],
    problem: (message) => [
      record('error', {
        threadId,
        turnId,
        willRetry: true,
        error: { message, additionalDetails: null },
      } satisfies Payload<'error'>),
    ],
    ends: (ending, usage) => {
      if (ending._tag === 'CutOff')
        return {
          records: [],
          end: new HarnessError({
            message: failureReason(
              { exitCode: null, signal: 'SIGKILL', stderr: '' },
              { harness: CODEX.product, cwd, binary: CODEX.onPath },
              () => true,
            ),
          }),
        };
      const failedWith =
        ending._tag === 'Failed'
          ? ending.reason
          : ending._tag === 'LoggedOut'
            ? CODEX.notLoggedIn
            : undefined;
      const last = tokens(usage);
      return {
        records: [
          ...(ending._tag === 'LoggedOut'
            ? [
                record('error', {
                  threadId,
                  turnId,
                  willRetry: false,
                  error: {
                    message: CODEX.notLoggedIn,
                    additionalDetails: null,
                  },
                } satisfies Payload<'error'>),
              ]
            : [
                record('thread/tokenUsage/updated', {
                  threadId,
                  turnId,
                  tokenUsage: {
                    total: last,
                    last,
                    modelContextWindow: 272_000,
                  },
                } satisfies Payload<'thread/tokenUsage/updated'>),
              ]),
          record('turn/completed', {
            threadId,
            turn: {
              id: turnId,
              items: [],
              status: failedWith === undefined ? 'completed' : 'failed',
              error:
                failedWith === undefined
                  ? null
                  : { message: failedWith, additionalDetails: null },
            },
          } satisfies Payload<'turn/completed'>),
        ],
        end: {
          _tag: 'TurnEnd',
          status: failedWith === undefined ? 'done' : 'failed',
          ...(failedWith === undefined ? {} : { error: failedWith }),
          forkPoint: turnId,
          shown: true,
        },
      };
    },
  };
  return writer;
};
