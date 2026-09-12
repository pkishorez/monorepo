import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Activity, ArrowLeft, Plus, Send, X } from 'lucide-react';
import type { SessionStatus } from 'effect-webrtc';

interface ConversationSnapshot {
  readonly remoteId: string;
  readonly status: SessionStatus;
  readonly messages: ReadonlyArray<{
    readonly id: string;
    readonly author: string;
    readonly text: string;
    readonly delivery: 'pending' | 'delivered' | 'failed';
  }>;
  readonly activity: ReadonlyArray<string>;
}

interface DemoSnapshot {
  readonly localId: string;
  readonly signaling: string;
  readonly conversations: ReadonlyArray<ConversationSnapshot>;
}

interface EffectWebRtcDemoProps {
  readonly snapshot: DemoSnapshot;
  readonly onConnect: (remoteId: string) => void;
  readonly onDisconnect: (remoteId: string) => void;
  readonly onSend: (remoteId: string, text: string) => void;
  readonly onFlows: () => void;
}

const statusTone = {
  Connecting: 'bg-amber-400 animate-pulse',
  Connected: 'bg-emerald-500',
  Reconnecting: 'bg-amber-400 animate-pulse',
} as const;

const statusText = (conversation: ConversationSnapshot) => {
  const { status } = conversation;
  if (status._tag === 'Connected') return 'Connected';
  const phase = status.phase?.replaceAll('-', ' ') ?? 'waiting for peer';
  return `${status._tag} · ${phase}`;
};

function ConversationPanel({
  conversation,
  localId,
  onDisconnect,
  onSend,
}: {
  readonly conversation: ConversationSnapshot;
  readonly localId: string;
  readonly onDisconnect: () => void;
  readonly onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [diagnostics, setDiagnostics] = useState(false);
  const connected = conversation.status._tag === 'Connected';
  const send = () => {
    const text = draft.trim();
    if (!connected || text.length === 0) return;
    onSend(text);
    setDraft('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <section className="flex min-h-[32rem] w-[min(90vw,42rem)] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">{conversation.remoteId}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={`size-2 rounded-full ${statusTone[conversation.status._tag]}`}
            />
            {statusText(conversation)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Negotiation {conversation.status.role.toLowerCase()}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Close conversation with ${conversation.remoteId}`}
          className="grid size-9 place-items-center rounded-lg border hover:bg-muted"
          onClick={onDisconnect}
        >
          <X className="size-4" />
        </button>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5"
        aria-live="polite"
      >
        {conversation.messages.length === 0 ? (
          <div className="grid flex-1 place-items-center text-center text-sm text-muted-foreground">
            <p>
              {connected
                ? 'Send the first message.'
                : 'Waiting for peer or network…'}
            </p>
          </div>
        ) : (
          conversation.messages.map((message) => {
            const own = message.author === localId;
            return (
              <div
                key={message.id}
                className={`flex max-w-[85%] flex-col gap-1 ${own ? 'ml-auto items-end' : 'items-start'}`}
              >
                <span className="px-1 text-xs text-muted-foreground">
                  {message.author}
                </span>
                <p
                  className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm ${own ? 'bg-foreground text-background' : 'bg-muted'}`}
                >
                  {message.text}
                </p>
                {own ? (
                  <span className="px-1 text-xs capitalize text-muted-foreground">
                    {message.delivery}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <footer className="border-t p-4">
        <button
          type="button"
          className="mb-3 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setDiagnostics((open) => !open)}
        >
          {diagnostics ? 'Hide' : 'Show'} connection activity
        </button>
        {diagnostics ? (
          <ol className="mb-3 max-h-28 overflow-y-auto rounded-lg bg-muted p-3 font-mono text-[11px] text-muted-foreground">
            {conversation.activity.map((activity, index) => (
              <li key={`${index}-${activity}`}>{activity}</li>
            ))}
          </ol>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={500}
            rows={2}
            disabled={!connected}
            aria-label={`Message to ${conversation.remoteId}`}
            placeholder={connected ? 'Write a message…' : 'Connecting…'}
            className="min-h-11 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={!connected || draft.trim().length === 0}
            aria-label={`Send to ${conversation.remoteId}`}
            className="grid size-11 place-items-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>
      </footer>
    </section>
  );
}

export function PeerSetup({
  onSetup,
}: {
  readonly onSetup: (id: string) => void;
}) {
  const [id, setId] = useState('');
  const normalized = id.trim().toLowerCase();
  const valid = /^[a-z0-9_-]{1,64}$/.test(normalized);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) onSetup(normalized);
  };
  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm"
      >
        <h1 className="text-2xl font-bold">Choose your Peer Identifier</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Other Peers use this identifier to reach you through free public Nostr
          relays. It lasts only until this page closes.
        </p>
        <input
          autoFocus
          value={id}
          onChange={(event) => setId(event.target.value)}
          maxLength={64}
          placeholder="alice"
          className="mt-5 h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Lowercase letters, numbers, hyphens, and underscores.
        </p>
        <button
          type="submit"
          disabled={!valid}
          className="mt-5 h-11 w-full rounded-xl bg-foreground text-sm font-medium text-background disabled:opacity-40"
        >
          Become reachable
        </button>
      </form>
    </main>
  );
}

export function EffectWebRtcDemo({
  snapshot,
  onConnect,
  onDisconnect,
  onSend,
  onFlows,
}: EffectWebRtcDemoProps) {
  const [remoteId, setRemoteId] = useState('');
  const normalized = remoteId.trim().toLowerCase();
  const valid =
    /^[a-z0-9_-]{1,64}$/.test(normalized) && normalized !== snapshot.localId;
  const connect = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || snapshot.conversations.length >= 20) return;
    onConnect(normalized);
    setRemoteId('');
  };

  return (
    <main className="min-h-svh bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <a
              href="/demos"
              className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Demos
            </a>
            <h1 className="text-3xl font-bold tracking-tight">Effect WebRTC</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You are{' '}
              <strong className="text-foreground">{snapshot.localId}</strong> ·{' '}
              {snapshot.signaling}
            </p>
          </div>
          <button
            type="button"
            onClick={onFlows}
            className="mt-9 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Activity className="size-4" />
            Flows
          </button>
        </header>

        <form onSubmit={connect} className="mb-6 flex max-w-lg gap-2">
          <input
            value={remoteId}
            onChange={(event) => setRemoteId(event.target.value)}
            placeholder="Peer to chat with"
            maxLength={64}
            className="h-11 flex-1 rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={!valid || snapshot.conversations.length >= 20}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40"
          >
            <Plus className="size-4" />
            Connect
          </button>
        </form>

        {snapshot.conversations.length === 0 ? (
          <div className="grid min-h-[30rem] place-items-center rounded-2xl border border-dashed text-center text-sm text-muted-foreground">
            <p>
              Enter a Peer Identifier to start a Conversation.
              <br />
              Incoming Conversations appear automatically.
            </p>
          </div>
        ) : (
          <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4">
            {snapshot.conversations.map((conversation) => (
              <ConversationPanel
                key={conversation.remoteId}
                conversation={conversation}
                localId={snapshot.localId}
                onDisconnect={() => onDisconnect(conversation.remoteId)}
                onSend={(text) => onSend(conversation.remoteId, text)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
