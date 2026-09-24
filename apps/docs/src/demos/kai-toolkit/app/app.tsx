import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { eq, useLiveQuery } from '@tanstack/react-db';
import {
  ArrowLeft,
  Bot,
  Plus,
  Send,
  Square,
  TerminalSquare,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button } from 'kui-toolkit/components/ui/button';
import { Textarea } from 'kui-toolkit/components/ui/textarea';
import { CLAUDE_MODELS, CODEX_MODELS } from 'kai-toolkit/rpc';
import type { Thread } from 'kai-toolkit/table';
import { aiPlayground, type AiPlaygroundClient } from '../client/index.js';
import {
  Conversation,
  ThreadStatusBadge,
  ThreadStatusDot,
  isActiveStatus,
  type InteractionHandlers,
} from '../ui/index.js';

const EMPTY: readonly never[] = [];

function Playground({ client }: { readonly client: AiPlaygroundClient }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [claudeModel, setClaudeModel] =
    useState<(typeof CLAUDE_MODELS)[number]>('claude-sonnet-4-6');
  const [codexModel, setCodexModel] =
    useState<(typeof CODEX_MODELS)[number]>('gpt-6-astra');
  const { data: threadRows } = useLiveQuery((q) =>
    q
      .from({ thread: client.threads })
      .orderBy(({ thread }) => thread.id, 'desc'),
  );
  const threads = threadRows ?? EMPTY;
  const selected = threads.find((thread) => thread.id === selectedId) ?? null;
  const { data: messageRows } = useLiveQuery(
    (q) =>
      selectedId === null
        ? null
        : q
            .from({ message: client.messages })
            .where(({ message }) => eq(message.threadId, selectedId))
            .orderBy(({ message }) => message.createdAt, 'asc'),
    [selectedId],
  );
  const messages = messageRows ?? EMPTY;
  const sending = selected !== null && isActiveStatus(selected.status);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    composer.current?.focus();
  }, [selectedId]);

  useEffect(() => {
    if (selectedId === null && threads[0] !== undefined)
      setSelectedId(threads[0].id);
  }, [selectedId, threads]);

  const perform = async (work: () => Promise<void>) => {
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const create = (harness: 'claude' | 'codex') =>
    void perform(async () => setSelectedId(await client.createThread(harness)));

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (selected === null || content.length === 0 || sending) return;
    setDraft('');
    void perform(() =>
      selected.harness === 'claude'
        ? client.sendClaude(selected.id, content, claudeModel)
        : client.sendCodex(selected.id, content, codexModel),
    );
  };

  const interactions: InteractionHandlers = useMemo(
    () => ({
      claude: (runId, requestId, answer) =>
        void perform(() => client.respondClaude(runId, requestId, answer)),
      codex: (runId, requestId, answer) =>
        void perform(() => client.respondCodex(runId, requestId, answer)),
    }),
    [client],
  );

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <main className="flex h-dvh min-h-0 bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/20 max-md:w-20">
        <div className="flex h-14 items-center gap-2 border-b px-4 max-md:justify-center max-md:px-2">
          <Bot className="size-5" />
          <span className="font-semibold max-md:hidden">KAI Toolkit</span>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 max-md:grid-cols-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => create('claude')}
            aria-label="New Claude thread"
          >
            <Plus className="size-4" />
            <span className="max-md:hidden">Claude</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => create('codex')}
            aria-label="New Codex thread"
          >
            <Plus className="size-4" />
            <span className="max-md:hidden">Codex</span>
          </Button>
        </div>
        <nav
          aria-label="Threads"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
        >
          {threads.map((thread) => (
            <ThreadButton
              key={thread.id}
              thread={thread}
              selected={thread.id === selectedId}
              onClick={() => setSelectedId(thread.id)}
            />
          ))}
        </nav>
        <Link
          to="/demos"
          className="flex min-h-12 items-center gap-2 border-t px-4 text-sm text-muted-foreground hover:text-foreground max-md:justify-center max-md:px-2"
        >
          <ArrowLeft className="size-4" />
          <span className="max-md:hidden">All demos</span>
        </Link>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">
              {selected === null
                ? 'Choose or create a thread'
                : `${selected.harness} · ${selected.id.slice(0, 8)}`}
            </h1>
            {selected === null ? (
              <p className="text-xs text-muted-foreground">
                kai-toolkit.kishore.computer
              </p>
            ) : (
              <ThreadStatusBadge status={selected.status} />
            )}
          </div>
          {selected !== null && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="max-sm:hidden">Model</span>
              {selected.harness === 'claude' ? (
                <select
                  className="h-11 max-w-48 rounded-md border bg-background px-2 text-base text-foreground sm:h-9 sm:text-sm"
                  value={claudeModel}
                  onChange={(event) => {
                    const model = CLAUDE_MODELS.find(
                      (candidate) => candidate === event.target.value,
                    );
                    if (model !== undefined) setClaudeModel(model);
                  }}
                >
                  {CLAUDE_MODELS.map((model) => (
                    <option key={model}>{model}</option>
                  ))}
                </select>
              ) : (
                <select
                  className="h-11 max-w-48 rounded-md border bg-background px-2 text-base text-foreground sm:h-9 sm:text-sm"
                  value={codexModel}
                  onChange={(event) => {
                    const model = CODEX_MODELS.find(
                      (candidate) => candidate === event.target.value,
                    );
                    if (model !== undefined) setCodexModel(model);
                  }}
                >
                  {CODEX_MODELS.map((model) => (
                    <option key={model}>{model}</option>
                  ))}
                </select>
              )}
            </label>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {selected === null ? (
            <EmptyState />
          ) : messages.length === 0 ? (
            <ThreadEmpty harness={selected.harness} />
          ) : (
            <Conversation
              key={selected.id}
              messages={messages}
              harness={selected.harness}
              status={selected.status}
              interactions={interactions}
            />
          )}
        </div>

        <div className="shrink-0 border-t bg-background p-3 sm:p-4">
          <form
            className="mx-auto flex max-w-3xl items-end gap-2"
            onSubmit={submit}
          >
            <Textarea
              ref={composer}
              autoFocus
              aria-label="Message"
              placeholder={
                selected === null
                  ? 'Create a thread to begin'
                  : `Ask ${selected.harness} anything…`
              }
              disabled={selected === null}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              className="max-h-48 min-h-11 resize-y"
            />
            {sending && selected !== null ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label="Stop run"
                onClick={() =>
                  void perform(() => client.cancelThread(selected))
                }
              >
                <Square className="size-4 fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                className="size-11 shrink-0"
                aria-label="Send message"
                disabled={selected === null || draft.trim().length === 0}
              >
                <Send className="size-4" />
              </Button>
            )}
          </form>
          {error !== null && (
            <p
              role="alert"
              className="mx-auto mt-2 max-w-3xl text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">
            ⌘ Enter to send · records appear through per-thread sync
          </p>
        </div>
      </section>
    </main>
  );
}

function ThreadButton({
  thread,
  selected,
  onClick,
}: {
  readonly thread: Thread;
  readonly selected: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1 flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition-colors ${selected ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'} max-md:justify-center max-md:px-2`}
    >
      {thread.harness === 'claude' ? (
        <Bot className="size-4 shrink-0" />
      ) : (
        <TerminalSquare className="size-4 shrink-0" />
      )}
      <span className="truncate max-md:hidden">
        {thread.harness} · {thread.id.slice(0, 8)}
      </span>
      <ThreadStatusDot status={thread.status} />
    </button>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div>
        <Bot className="mx-auto mb-4 size-8 text-muted-foreground" />
        <h2 className="font-semibold">Start with a real harness</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Create a Claude or Codex thread. Messages are assembled on the server,
          persisted, and synced back here.
        </p>
      </div>
    </div>
  );
}

function ThreadEmpty({ harness }: { readonly harness: 'claude' | 'codex' }) {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div>
        <h2 className="font-semibold">New {harness} thread</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send a prompt below. The CLI runs from its own working directory.
        </p>
      </div>
    </div>
  );
}

export function KaiToolkitPlayground() {
  const [client, setClient] = useState<AiPlaygroundClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void aiPlayground().then(setClient, (cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, []);
  if (client !== null) return <Playground client={client} />;
  return (
    <main className="grid h-dvh place-items-center bg-background p-8 text-center">
      <div>
        <Bot className="mx-auto mb-4 size-8 text-muted-foreground" />
        <h1 className="font-semibold">Connecting to KAI Toolkit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {error ?? 'Opening the WebSocket and local sync replica…'}
        </p>
      </div>
    </main>
  );
}
