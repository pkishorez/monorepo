import type { QuestionAnswer } from '../../contract/wire/index.js';
import { failureReason, HarnessError } from '../contract/index.js';
import { QUESTION_ANSWERED } from '../claude/project/index.js';
import { CLAUDE } from './catalog.js';
import type { ToolStep, Writer, WriterContext } from './writer.js';
import { recordOf } from './writer.js';

/*
 * Claude Code's records, as its Agent SDK writes them and the harness keeps
 * them (`../claude/agent`): `system/init` opening each turn; `text.chunk`s
 * then the whole `assistant` record pointing at them; each tool a
 * `tool_use` block, its result a `user` record's `tool_result`; a subagent
 * an `Agent` call whose records carry its id; an Agent Question an
 * `AskUserQuestion` call answered by `question.answered` and its result;
 * a Background Job a call with `run_in_background`, ended by
 * `system/task_notification`; and a `result` that ends the turn. Shaped
 * after the fixtures recorded from Claude Code
 * (`../claude/project/tests/fixtures`).
 */

/** What Claude Code tells the agent when the user declines an Agent Question. */
const DECLINED =
  'The user declined to answer. Carry on without their answer, and do not assume what they would have chosen.';

const absolute = (cwd: string, path: string) =>
  path.startsWith('/') ? path : `${cwd}/${path}`;

/** A tool's call as Claude Code names it, and what its result says. */
const callOf = (
  step: ToolStep,
  cwd: string,
): {
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output: unknown;
} => {
  switch (step._tag) {
    case 'Read':
      return {
        name: 'Read',
        input: { file_path: absolute(cwd, step.path) },
        output:
          step.images === undefined
            ? step.text
            : [
                ...(step.text === ''
                  ? []
                  : [{ type: 'text', text: step.text }]),
                ...step.images.map(({ mediaType, data }) => ({
                  type: 'image',
                  source: { type: 'base64', media_type: mediaType, data },
                })),
              ],
      };
    case 'Write':
      return {
        name: 'Write',
        input: { file_path: absolute(cwd, step.path), content: step.content },
        output: `File created successfully at: ${absolute(cwd, step.path)}`,
      };
    case 'Edit':
      return {
        name: 'Edit',
        input: {
          file_path: absolute(cwd, step.path),
          old_string: step.before,
          new_string: step.after,
          replace_all: false,
        },
        output: `The file ${absolute(cwd, step.path)} has been updated successfully.`,
      };
    case 'Delete':
      return {
        name: 'Bash',
        input: {
          command: `rm ${step.path}`,
          description: `Delete ${step.path}`,
        },
        output: '',
      };
    case 'Bash':
      return {
        name: 'Bash',
        input: { command: step.command, description: `Run ${step.command}` },
        output: step.output,
      };
    case 'Search':
      return {
        name: 'Grep',
        input: {
          pattern: step.pattern,
          path: step.path,
          output_mode: 'content',
        },
        output: step.output,
      };
    case 'Web':
      return {
        name: 'WebFetch',
        input: { url: step.url, prompt: step.query },
        output: step.output,
      };
    case 'Mcp':
      return {
        name: `mcp__${step.server}__${step.tool}`,
        input: step.input,
        output: [{ type: 'text', text: step.output }],
      };
    case 'Other':
      return {
        name: step.name,
        input: { description: step.description },
        output: step.output,
      };
  }
};

const failed = (step: ToolStep, reason: string) =>
  step._tag === 'Bash' || step._tag === 'Delete'
    ? `Exit code 1\n${reason}`
    : `<tool_use_error>${reason}</tool_use_error>`;

/** The answer as Claude Code tells the agent: each question by its text, the choices joined. */
const toldAnswers = (
  questions: ReadonlyArray<{ readonly question: string }>,
  answer: QuestionAnswer,
) =>
  `Your questions have been answered: ${questions
    .flatMap((question, index) => {
      const chosen = (answer[String(index)] ?? []).filter(
        (each) => each !== '',
      );
      return chosen.length === 0
        ? []
        : [`"${question.question}"="${chosen.join(', ')}"`];
    })
    .join(', ')}. You can now continue with the user's answers in mind.`;

export const claudeWriter = (context: WriterContext): Writer => {
  const { nativeId, cwd, model, agentId, id } = context;
  const record = (kind: string, payload: unknown) =>
    recordOf(kind, payload, agentId);
  const common = () => ({
    parent_tool_use_id: agentId ?? null,
    session_id: nativeId,
    uuid: id('uuid-'),
  });

  const assistant = (
    content: ReadonlyArray<unknown>,
    messageId: string = id('msg_fake'),
  ) =>
    record('assistant', {
      type: 'assistant',
      message: {
        model,
        id: messageId,
        type: 'message',
        role: 'assistant',
        content,
        stop_reason: null,
        usage: { input_tokens: 4, output_tokens: 32 },
      },
      ...common(),
    });

  const toolResult = (
    toolUseId: string,
    content: unknown,
    isError: boolean,
    toolUseResult?: unknown,
  ) =>
    record('user', {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            tool_use_id: toolUseId,
            type: 'tool_result',
            content,
            ...(isError ? { is_error: true } : {}),
          },
        ],
      },
      ...common(),
      ...(toolUseResult === undefined
        ? {}
        : { tool_use_result: toolUseResult }),
    });

  const call = (name: string, input: unknown) => {
    const toolUseId = id('toolu_fake');
    return {
      toolUseId,
      record: assistant([{ type: 'tool_use', id: toolUseId, name, input }]),
    };
  };

  const writer: Writer = {
    opens: () =>
      agentId !== undefined
        ? []
        : [
            record('system/init', {
              type: 'system',
              subtype: 'init',
              cwd,
              session_id: nativeId,
              model,
              tools: ['Agent', 'Bash', 'Edit', 'Grep', 'Read', 'Write'],
              mcp_servers: [{ name: 'github', status: 'connected' }],
              permissionMode: 'bypassPermissions',
              slash_commands: [],
              uuid: id('uuid-'),
            }),
          ],
    text: (channel, pieces) => {
      const messageId = id('msg_fake');
      const streamId = `${messageId}:0`;
      return {
        chunks: pieces.map((text) =>
          record('text.chunk', { streamId, channel, text }),
        ),
        whole: [
          assistant(
            [
              channel === 'text'
                ? { type: 'text', text: { $stream: streamId } }
                : {
                    type: 'thinking',
                    thinking: { $stream: streamId },
                    signature: '',
                  },
            ],
            messageId,
          ),
        ],
      };
    },
    tool: (step) => {
      const { name, input, output } = callOf(step, cwd);
      const made = call(name, input);
      return {
        call: [made.record],
        result: [
          toolResult(
            made.toolUseId,
            step.fails === undefined ? output : failed(step, step.fails),
            step.fails !== undefined,
          ),
        ],
      };
    },
    plan: (step) => {
      const made = call('TodoWrite', {
        todos: step.items.map(({ step: content, status }) => ({
          content,
          status,
          activeForm: content,
        })),
      });
      return [
        made.record,
        toolResult(
          made.toolUseId,
          'Todos have been modified successfully. Ensure that you continue to use the todo list to track your progress. Please proceed with the current tasks if applicable',
          false,
        ),
      ];
    },
    subagent: (step) => {
      const made = call('Agent', {
        description: step.task,
        prompt: step.prompt,
        subagent_type: 'general-purpose',
      });
      const taskId = id('a');
      const child = claudeWriter({ ...context, agentId: made.toolUseId });
      return {
        call: [
          made.record,
          record('system/task_started', {
            type: 'system',
            subtype: 'task_started',
            task_id: taskId,
            tool_use_id: made.toolUseId,
            description: step.task,
            ...common(),
          }),
          recordOf(
            'user',
            {
              type: 'user',
              message: {
                role: 'user',
                content: [{ type: 'text', text: step.prompt }],
              },
              parent_tool_use_id: made.toolUseId,
              session_id: nativeId,
              uuid: id('uuid-'),
            },
            made.toolUseId,
          ),
        ],
        child,
        report: () => [
          toolResult(
            made.toolUseId,
            [
              { type: 'text', text: step.report },
              {
                type: 'text',
                text: `agentId: ${taskId} (use SendMessage with to: '${taskId}' to continue this agent)`,
              },
            ],
            false,
          ),
        ],
      };
    },
    ask: (step, now) => {
      const input = {
        questions: step.items.map((item) => ({
          question: item.question,
          header: item.header,
          options: item.options,
          multiSelect: item.multiSelect === true,
        })),
      };
      const made = call('AskUserQuestion', input);
      return {
        question: {
          id: made.toolUseId,
          items: step.items.map((item, index) => ({
            id: String(index),
            header: item.header,
            question: item.question,
            options: item.options,
            multiSelect: item.multiSelect === true,
            // Claude Code always lets one's own answer be typed, and keeps none secret.
            other: true,
            secret: false,
          })),
          askedAt: now,
        },
        records: [made.record],
        answered: (answer) => [
          record(QUESTION_ANSWERED, {
            toolUseId: made.toolUseId,
            answers: answer,
          }),
          answer === null
            ? toolResult(made.toolUseId, DECLINED, true)
            : toolResult(
                made.toolUseId,
                toldAnswers(input.questions, answer),
                false,
              ),
        ],
      };
    },
    job: (step) => {
      const taskId = id(step.kind === 'shell' ? 'b' : 'a');
      const made =
        step.kind === 'shell'
          ? call('Bash', {
              command: step.title,
              description: `Run ${step.title}`,
              run_in_background: true,
            })
          : call('Agent', {
              description: step.title,
              prompt: step.title,
              subagent_type: 'general-purpose',
              run_in_background: true,
            });
      return {
        id: taskId,
        toolCallId: made.toolUseId,
        records: [
          made.record,
          step.kind === 'shell'
            ? toolResult(
                made.toolUseId,
                `Command running in background with ID: ${taskId}. Output is being written to: /tmp/claude/tasks/${taskId}.output`,
                false,
                { backgroundTaskId: taskId },
              )
            : toolResult(
                made.toolUseId,
                `Async agent launched successfully.\nagentId: ${taskId} (internal ID - do not mention to user.)`,
                false,
                { isAsync: true, status: 'async_launched', agentId: taskId },
              ),
        ],
        ended: (how, summary) => [
          // A background subagent's report is its last words.
          ...(step.kind === 'agent' && summary !== ''
            ? [
                recordOf(
                  'assistant',
                  {
                    type: 'assistant',
                    message: {
                      model,
                      id: id('msg_fake'),
                      type: 'message',
                      role: 'assistant',
                      content: [{ type: 'text', text: summary }],
                    },
                    parent_tool_use_id: made.toolUseId,
                    session_id: nativeId,
                    uuid: id('uuid-'),
                  },
                  made.toolUseId,
                ),
              ]
            : []),
          record('system/task_notification', {
            type: 'system',
            subtype: 'task_notification',
            task_id: taskId,
            tool_use_id: made.toolUseId,
            status: how === 'done' ? 'completed' : how,
            output_file: `/tmp/claude/tasks/${taskId}.output`,
            summary:
              summary ||
              `${step.kind === 'shell' ? 'Background command' : 'Agent'} "${step.title}" ${how === 'done' ? 'completed' : how}`,
            ...common(),
          }),
        ],
      };
    },
    compact: () => [
      record('system/compact_boundary', {
        type: 'system',
        subtype: 'compact_boundary',
        compact_metadata: { trigger: 'auto', pre_tokens: 167_000 },
        ...common(),
      }),
    ],
    // Claude Code retries quietly: shown as nothing.
    problem: (message) => [
      record('system/api_retry', {
        type: 'system',
        subtype: 'api_retry',
        attempt: 1,
        max_retries: 10,
        error: message,
        ...common(),
      }),
    ],
    ends: (ending, usage, said) => {
      const forkPoint = `${nativeId}:${context.turnId}`;
      if (ending._tag === 'CutOff')
        return {
          records: [],
          end: new HarnessError({
            message: failureReason(
              { exitCode: 137, signal: null, stderr: '' },
              { harness: CLAUDE.product, cwd, binary: CLAUDE.onPath },
              () => true,
            ),
          }),
        };
      const failedWith =
        ending._tag === 'Failed'
          ? ending.reason
          : ending._tag === 'LoggedOut'
            ? CLAUDE.notLoggedIn
            : undefined;
      const result = {
        type: 'result',
        subtype:
          ending._tag === 'Failed' ? 'error_during_execution' : 'success',
        is_error: failedWith !== undefined,
        terminal_reason: failedWith === undefined ? 'completed' : 'error',
        stop_reason: failedWith === undefined ? 'end_turn' : null,
        duration_ms: 3_000,
        num_turns: 1,
        result: ending._tag === 'LoggedOut' ? CLAUDE.notLoggedIn : said,
        ...(ending._tag === 'Failed' ? { errors: [ending.reason] } : {}),
        total_cost_usd:
          (usage.input * 5 + usage.output * 25 + usage.cacheRead * 0.5) / 1e6,
        usage: {
          input_tokens: usage.input,
          output_tokens: usage.output,
          cache_read_input_tokens: usage.cacheRead,
          cache_creation_input_tokens: 0,
        },
        ...common(),
      };
      return {
        records: [
          ...(ending._tag === 'LoggedOut'
            ? [assistant([{ type: 'text', text: CLAUDE.notLoggedIn }])]
            : []),
          record('result', result),
        ],
        end: {
          _tag: 'TurnEnd',
          status: failedWith === undefined ? 'done' : 'failed',
          ...(failedWith === undefined ? {} : { error: failedWith }),
          forkPoint,
          shown: true,
        },
      };
    },
  };
  return writer;
};
