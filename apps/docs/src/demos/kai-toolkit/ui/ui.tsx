import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { Button } from 'kui-toolkit/components/ui/button';
import type { Message, Thread } from 'kai-toolkit/table';
import {
  CLAUDE_PARTS,
  CODEX_PARTS,
  COMMON_PARTS,
  type AiCustomPart,
  type AiMessagePart,
  type ClaudeAnswer,
  type CodexAnswer,
} from 'kai-toolkit/rpc';
import {
  toUiConversation,
  type AiUiActivity,
  type AiUiQuestionInteraction,
} from 'kai-toolkit/client';

type ThreadStatus = Thread['status'];

export const THREAD_STATUS_LABEL: Record<ThreadStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  'waiting-question': 'Waiting for your answer',
  'waiting-approval': 'Waiting for your approval',
  cancelled: 'Last run cancelled',
  failed: 'Last run failed',
};

const STATUS_DOT: Record<ThreadStatus, string> = {
  idle: 'bg-muted-foreground/40',
  running: 'bg-sky-500 animate-pulse',
  'waiting-question': 'bg-amber-500',
  'waiting-approval': 'bg-amber-500',
  cancelled: 'bg-muted-foreground/40',
  failed: 'bg-destructive',
};

const STATUS_TEXT: Record<ThreadStatus, string> = {
  idle: 'text-muted-foreground',
  running: 'text-sky-600 dark:text-sky-400',
  'waiting-question': 'text-amber-600 dark:text-amber-400',
  'waiting-approval': 'text-amber-600 dark:text-amber-400',
  cancelled: 'text-muted-foreground',
  failed: 'text-destructive',
};

export const isActiveStatus = (status: ThreadStatus): boolean =>
  status === 'running' ||
  status === 'waiting-question' ||
  status === 'waiting-approval';

/** A dot that reflects the Thread Status, for the thread list. */
export function ThreadStatusDot({ status }: { readonly status: ThreadStatus }) {
  if (status === 'idle') return null;
  return (
    <span
      aria-label={THREAD_STATUS_LABEL[status]}
      title={THREAD_STATUS_LABEL[status]}
      className={`ml-auto size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`}
    />
  );
}

/** Dot plus label, for the conversation header. */
export function ThreadStatusBadge({
  status,
}: {
  readonly status: ThreadStatus;
}) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 text-xs ${STATUS_TEXT[status]}`}
    >
      <span className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
      {THREAD_STATUS_LABEL[status]}
    </span>
  );
}

export interface InteractionHandlers {
  readonly claude: (
    runId: string,
    requestId: string,
    answer: ClaudeAnswer,
  ) => void;
  readonly codex: (
    runId: string,
    requestId: string,
    answer: CodexAnswer,
  ) => void;
}

const inspect = (value: unknown): string => {
  if (typeof value === 'string') return value;
  const encoded = JSON.stringify(value, null, 2);
  return encoded ?? String(value);
};

const sourceUrl = (
  source:
    | { type: 'data'; value: string; mimeType: string }
    | { type: 'url'; value: string; mimeType?: string },
): string =>
  source.type === 'url'
    ? source.value
    : `data:${source.mimeType};base64,${source.value}`;

function RequestActions({
  onAllow,
  onDeny,
}: {
  readonly onAllow: () => void;
  readonly onDeny: () => void;
}) {
  return (
    <div className="mt-3 flex gap-2">
      <Button size="sm" className="min-h-11" onClick={onAllow}>
        <Check className="size-4" /> Allow
      </Button>
      <Button size="sm" className="min-h-11" variant="outline" onClick={onDeny}>
        <X className="size-4" /> Deny
      </Button>
    </div>
  );
}

function QuestionForm({
  questions,
  onSubmit,
}: {
  readonly questions: ReadonlyArray<{
    readonly id: string;
    readonly prompt: string;
    readonly choices?: ReadonlyArray<string>;
  }>;
  readonly onSubmit: (
    answers: Readonly<Record<string, ReadonlyArray<string>>>,
  ) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(
      Object.fromEntries(
        questions.map((question) => [
          question.id,
          [answers[question.id] ?? ''],
        ]),
      ),
    );
  };
  return (
    <form className="mt-3 space-y-3" onSubmit={submit}>
      {questions.map((question) => (
        <label key={question.id} className="block text-sm">
          <span className="mb-1.5 block font-medium">{question.prompt}</span>
          {question.choices === undefined ? (
            <input
              className="h-11 w-full rounded-md border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
              required
              value={answers[question.id] ?? ''}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  [question.id]: event.target.value,
                }))
              }
            />
          ) : (
            <select
              className="h-11 w-full rounded-md border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
              required
              value={answers[question.id] ?? ''}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  [question.id]: event.target.value,
                }))
              }
            >
              <option value="">Choose an answer</option>
              {question.choices.map((choice) => (
                <option key={choice}>{choice}</option>
              ))}
            </select>
          )}
        </label>
      ))}
      <Button size="sm" className="min-h-11" type="submit">
        Answer
      </Button>
    </form>
  );
}

function QuestionInteraction({
  interaction,
  runId,
  harness,
  interactions,
}: {
  readonly interaction: AiUiQuestionInteraction;
  readonly runId: string;
  readonly harness: 'claude' | 'codex';
  readonly interactions: InteractionHandlers;
}) {
  return (
    <section className="rounded-xl border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Question
        </span>
        {interaction.resolved && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3.5" /> Answered
          </span>
        )}
      </div>
      {!interaction.resolved ? (
        <QuestionForm
          questions={interaction.questions}
          onSubmit={(submitted) =>
            harness === 'claude'
              ? interactions.claude(runId, interaction.requestId, {
                  behavior: 'answer',
                  answers: submitted,
                })
              : interactions.codex(runId, interaction.requestId, {
                  type: 'question',
                  answers: submitted,
                })
          }
        />
      ) : (
        <div className="space-y-3">
          {interaction.questions.map((item) => (
            <div key={item.id}>
              <p className="text-sm font-medium">{item.prompt}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {interaction.answers?.[item.id]?.join(', ') ?? 'Resolved'}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const card = (label: string, body: ReactNode) => (
  <div className="rounded-lg border bg-muted/30 p-3">
    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
    {body}
  </div>
);

function CustomPart({
  part,
  runId,
  harness,
  interactions,
  resolved,
}: {
  readonly part: AiCustomPart;
  readonly runId: string;
  readonly harness: 'claude' | 'codex';
  readonly interactions: InteractionHandlers;
  readonly resolved: boolean;
}) {
  switch (part.name) {
    case COMMON_PARTS.ERROR:
      return (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {part.data.message}
        </div>
      );
    case COMMON_PARTS.PERMISSION_REQUEST:
      return card(
        part.data.title ?? 'Permission request',
        <>
          <p className="text-sm font-medium">{part.data.toolName}</p>
          <pre className="mt-2 max-h-52 overflow-auto text-xs text-muted-foreground">
            {inspect(part.data.input)}
          </pre>
          {resolved ? (
            <p className="mt-3 text-xs text-muted-foreground">Resolved</p>
          ) : (
            <RequestActions
              onAllow={() =>
                harness === 'claude'
                  ? interactions.claude(runId, part.data.requestId, {
                      behavior: 'allow',
                    })
                  : interactions.codex(runId, part.data.requestId, {
                      type: 'approval',
                      decision: 'accept',
                    })
              }
              onDeny={() =>
                harness === 'claude'
                  ? interactions.claude(runId, part.data.requestId, {
                      behavior: 'deny',
                    })
                  : interactions.codex(runId, part.data.requestId, {
                      type: 'approval',
                      decision: 'decline',
                    })
              }
            />
          )}
        </>,
      );
    case COMMON_PARTS.PERMISSION_RESOLVED:
      if (part.data.answer.behavior === 'answer') {
        return card(
          'Answer',
          <p className="text-sm">
            {Object.values(part.data.answer.answers).flat().join(', ')}
          </p>,
        );
      }
      return card(
        'Permission resolved',
        <pre className="text-xs">{inspect(part.data.answer)}</pre>,
      );
    case COMMON_PARTS.QUESTION:
      return card(
        'Question',
        resolved ? (
          <p className="text-sm text-muted-foreground">Resolved</p>
        ) : (
          <QuestionForm
            questions={part.data.questions}
            onSubmit={(answers) =>
              harness === 'claude'
                ? interactions.claude(runId, part.data.requestId, {
                    behavior: 'answer',
                    answers,
                  })
                : interactions.codex(runId, part.data.requestId, {
                    type: 'question',
                    answers,
                  })
            }
          />
        ),
      );
    case COMMON_PARTS.FILE_CHANGED:
      return card(
        'File changed',
        <p className="text-sm">
          <span className="capitalize">{part.data.operation}</span>{' '}
          <code>{part.data.path}</code>
        </p>,
      );
    case CLAUDE_PARTS.SUBAGENT:
      return card(
        'Claude subagent',
        <div className="flex items-center gap-2 text-sm">
          <ChevronRight className="size-4" />
          <span>
            Child message <code>{part.data.messageId}</code>
          </span>
        </div>,
      );
    case CLAUDE_PARTS.COMPACTION:
      return card('Compaction', <p className="text-sm">{part.data.status}</p>);
    case CODEX_PARTS.PLAN:
      return card(
        'Plan',
        <p className="whitespace-pre-wrap text-sm">{part.data.text}</p>,
      );
    case CODEX_PARTS.COMMAND:
      return card(
        'Command',
        <pre className="max-h-52 overflow-auto text-xs">
          {inspect(part.data.event)}
        </pre>,
      );
    case CODEX_PARTS.MCP:
      return card(
        'MCP',
        <pre className="max-h-52 overflow-auto text-xs">
          {inspect(part.data.event)}
        </pre>,
      );
    case CODEX_PARTS.REQUEST_RESOLVED:
      return card(
        'Request resolved',
        <pre className="text-xs">{inspect(part.data.answer)}</pre>,
      );
  }
}

function Part({
  part,
  runId,
  harness,
  interactions,
  resolvedRequests,
}: {
  readonly part: AiMessagePart;
  readonly runId: string;
  readonly harness: 'claude' | 'codex';
  readonly interactions: InteractionHandlers;
  readonly resolvedRequests: ReadonlySet<string>;
}) {
  switch (part.type) {
    case 'text':
      return <p className="whitespace-pre-wrap leading-7">{part.content}</p>;
    case 'image':
      return (
        <img
          className="max-h-96 rounded-md object-contain"
          src={sourceUrl(part.source)}
          alt="AI message attachment"
        />
      );
    case 'audio':
      return <audio controls src={sourceUrl(part.source)} />;
    case 'video':
      return (
        <video
          className="max-h-96 rounded-md"
          controls
          src={sourceUrl(part.source)}
        />
      );
    case 'document':
      return (
        <a
          className="text-sm underline underline-offset-4"
          href={sourceUrl(part.source)}
          target="_blank"
          rel="noreferrer"
        >
          Open document
        </a>
      );
    case 'tool-call':
      return card(
        `Tool · ${part.name}`,
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm">
            {part.state}
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto text-xs">
            {part.arguments || inspect(part.input)}
          </pre>
        </details>,
      );
    case 'tool-result':
      return card(
        'Tool result',
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm">
            {part.state}
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto text-xs">
            {inspect(part.content)}
          </pre>
        </details>,
      );
    case 'thinking':
      return (
        <details className="rounded-lg border border-dashed px-3 text-muted-foreground">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium uppercase tracking-wider">
            Thinking
          </summary>
          <p className="mb-3 whitespace-pre-wrap text-sm">{part.content}</p>
        </details>
      );
    case 'structured-output':
      return card(
        `Structured output · ${part.status}`,
        <pre className="max-h-72 overflow-auto text-xs">
          {inspect(part.data ?? part.partial ?? part.raw)}
        </pre>,
      );
    case 'ui-resource':
      return card(
        `UI resource · ${part.toolName}`,
        <a
          className="text-sm underline underline-offset-4"
          href={part.resource.uri}
        >
          {part.resource.uri}
        </a>,
      );
    case 'custom':
      return (
        <CustomPart
          part={part}
          runId={runId}
          harness={harness}
          interactions={interactions}
          resolved={
            (part.name === COMMON_PARTS.PERMISSION_REQUEST ||
              part.name === COMMON_PARTS.QUESTION) &&
            resolvedRequests.has(part.data.requestId)
          }
        />
      );
  }
}

function Activity({
  activity,
  runId,
  harness,
  interactions,
  resolvedRequests,
}: {
  readonly activity: AiUiActivity;
  readonly runId: string;
  readonly harness: 'claude' | 'codex';
  readonly interactions: InteractionHandlers;
  readonly resolvedRequests: ReadonlySet<string>;
}) {
  const actionRequired = activity.items.some(
    (part) =>
      part.type === 'custom' &&
      part.name === COMMON_PARTS.PERMISSION_REQUEST &&
      !resolvedRequests.has(part.data.requestId),
  );
  return (
    <details
      className="group rounded-lg border bg-muted/20"
      {...(actionRequired ? { open: true } : {})}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm text-muted-foreground marker:content-none">
        <ChevronRight className="size-4 shrink-0 group-open:rotate-90" />
        <span>{actionRequired ? 'Action required' : 'Activity'}</span>
        <span className="ml-auto text-xs tabular-nums">
          {activity.items.length}
        </span>
      </summary>
      <div className="space-y-3 border-t p-3">
        {activity.items.map((part, index) => (
          <Part
            key={index}
            part={part}
            runId={runId}
            harness={harness}
            interactions={interactions}
            resolvedRequests={resolvedRequests}
          />
        ))}
      </div>
    </details>
  );
}

export function Conversation({
  messages,
  harness,
  status,
  interactions,
}: {
  readonly messages: ReadonlyArray<Message>;
  readonly harness: 'claude' | 'codex';
  readonly status: ThreadStatus;
  readonly interactions: InteractionHandlers;
}) {
  const end = useRef<HTMLDivElement>(null);
  const conversation = useMemo(() => toUiConversation(messages), [messages]);
  // Scroll only when the person sends something, never while the assistant
  // is still writing, so a reader is not yanked away from earlier output.
  const lastUserMessageId = useMemo(
    () => messages.findLast((message) => message.role === 'user')?.id,
    [messages],
  );
  const resolvedRequests = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      for (const part of message.data.parts) {
        if (part.type !== 'custom') continue;
        if (
          part.name === COMMON_PARTS.PERMISSION_RESOLVED ||
          part.name === CODEX_PARTS.REQUEST_RESOLVED
        )
          ids.add(part.data.requestId);
      }
    }
    return ids;
  }, [messages]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lastUserMessageId]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-8">
      {conversation.map((ui) => {
        const onlyActivity =
          ui.parts.length === 1 && ui.parts[0]?.type === 'activity';
        return (
          <article
            key={ui.id}
            className={
              ui.role === 'user' && !onlyActivity
                ? 'ml-auto max-w-[85%]'
                : 'max-w-full'
            }
          >
            {!onlyActivity && (
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {ui.role}
              </div>
            )}
            <div
              className={
                ui.role === 'user' && !onlyActivity
                  ? 'space-y-3 rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground'
                  : 'space-y-3'
              }
            >
              {ui.parts.map((part, index) =>
                part.type === 'question-interaction' ? (
                  <QuestionInteraction
                    key={`${ui.id}:${index}`}
                    interaction={part}
                    runId={ui.runId}
                    harness={harness}
                    interactions={interactions}
                  />
                ) : part.type === 'activity' ? (
                  <Activity
                    key={`${ui.id}:${index}`}
                    activity={part}
                    runId={ui.runId}
                    harness={harness}
                    interactions={interactions}
                    resolvedRequests={resolvedRequests}
                  />
                ) : (
                  <Part
                    key={`${ui.id}:${index}`}
                    part={part}
                    runId={ui.runId}
                    harness={harness}
                    interactions={interactions}
                    resolvedRequests={resolvedRequests}
                  />
                ),
              )}
            </div>
          </article>
        );
      })}
      {status === 'running' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-sky-500" />
          {harness} is working…
        </div>
      )}
      {(status === 'waiting-question' || status === 'waiting-approval') && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <span className="size-2 rounded-full bg-amber-500" />
          {THREAD_STATUS_LABEL[status]}
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
