import { useState, type KeyboardEvent } from 'react';
import { Activity, ArrowLeft, Send } from 'lucide-react';

type PeerName = 'Alice' | 'Bob';

interface PeerView {
  readonly name: PeerName;
  readonly status: 'Disconnected' | 'Connecting' | 'Connected' | 'Reconnecting';
  readonly messages: ReadonlyArray<{
    readonly id: string;
    readonly author: PeerName;
    readonly text: string;
    readonly delivery: 'pending' | 'delivered' | 'failed';
  }>;
  readonly error: string | null;
}

export interface EffectWebRtcDemoProps {
  readonly snapshot: Readonly<Record<PeerName, PeerView>>;
  readonly onConnect: (peer: PeerName) => void;
  readonly onDisconnect: (peer: PeerName) => void;
  readonly onSend: (peer: PeerName, text: string) => void;
  readonly onFlows: () => void;
}

const statusTone = {
  Disconnected: 'bg-zinc-400',
  Connecting: 'bg-amber-400 animate-pulse',
  Connected: 'bg-emerald-500',
  Reconnecting: 'bg-amber-400 animate-pulse',
} as const;

function PeerPanel({
  peer,
  onConnect,
  onDisconnect,
  onSend,
}: {
  readonly peer: PeerView;
  readonly onConnect: () => void;
  readonly onDisconnect: () => void;
  readonly onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const connected = peer.status === 'Connected';
  const connecting = peer.status === 'Connecting';
  const active = connected || peer.status === 'Reconnecting';
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
    <section className="flex min-h-[28rem] flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">{peer.name}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={`size-2 rounded-full ${statusTone[peer.status]}`}
            />
            {peer.status}
          </div>
        </div>
        {active || connecting ? (
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            disabled={connecting}
            onClick={onDisconnect}
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-85"
            onClick={onConnect}
          >
            Connect to {peer.name === 'Alice' ? 'Bob' : 'Alice'}
          </button>
        )}
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5"
        aria-live="polite"
      >
        {peer.messages.length === 0 ? (
          <div className="grid flex-1 place-items-center text-center text-sm text-muted-foreground">
            <p>Messages will appear here after the Peers connect.</p>
          </div>
        ) : (
          peer.messages.map((message) => {
            const own = message.author === peer.name;
            return (
              <div
                key={message.id}
                className={`flex max-w-[85%] flex-col gap-1 ${own ? 'ml-auto items-end' : 'items-start'}`}
              >
                <span className="px-1 text-xs text-muted-foreground">
                  {message.author}
                </span>
                <p
                  className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm ${
                    own ? 'bg-foreground text-background' : 'bg-muted'
                  }`}
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
        {peer.error === null ? null : (
          <p className="mb-3 text-sm text-destructive" role="alert">
            {peer.error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={500}
            rows={2}
            disabled={!connected}
            aria-label={`Message from ${peer.name}`}
            placeholder={
              connected ? 'Write a message…' : 'Connect before messaging'
            }
            className="min-h-11 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={!connected || draft.trim().length === 0}
            aria-label={`Send as ${peer.name}`}
            className="grid size-11 place-items-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>
      </footer>
    </section>
  );
}

export function EffectWebRtcDemo({
  snapshot,
  onConnect,
  onDisconnect,
  onSend,
  onFlows,
}: EffectWebRtcDemoProps) {
  return (
    <main className="min-h-svh bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
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
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Signaling stays in this page. Messages travel between two Peers
              over a real WebRTC Data Channel.
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

        <div className="grid gap-5 lg:grid-cols-2">
          {(['Alice', 'Bob'] as const).map((name) => (
            <PeerPanel
              key={name}
              peer={snapshot[name]}
              onConnect={() => onConnect(name)}
              onDisconnect={() => onDisconnect(name)}
              onSend={(text) => onSend(name, text)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
