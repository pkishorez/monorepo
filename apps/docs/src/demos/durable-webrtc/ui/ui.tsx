import { useState, type FormEvent } from 'react';
import type { PeerMode } from 'effect-webrtc/signaling/durable';
import { ArrowLeft, LockKeyhole, LogOut, RefreshCw, Radio } from 'lucide-react';
import { ConversationPanel } from '../../effect-webrtc/ui/index.ts';
import type { DurableDemoSnapshot } from '../runtime/index.ts';

export function PeerProfile({
  accountName,
  onJoin,
  onSignOut,
}: {
  readonly accountName: string;
  readonly onJoin: (name: string, mode: PeerMode) => void;
  readonly onSignOut: () => void;
}) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<PeerMode>('Connectable');
  const valid = name.trim().length > 0 && name.trim().length <= 80;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) onJoin(name.trim(), mode);
  };

  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-12">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Signed in as {accountName}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Name this device
            </h1>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="grid size-11 shrink-0 place-items-center rounded-xl border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This is how your other signed-in devices will recognize this peer.
        </p>

        <label htmlFor="peer-name" className="mt-6 block text-sm font-medium">
          Device name
        </label>
        <input
          id="peer-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Work laptop"
          className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />

        <fieldset className="mt-6">
          <legend className="text-sm font-medium">Availability</legend>
          <div className="mt-2 grid gap-2">
            {(
              [
                [
                  'Connectable',
                  'Available for calls',
                  'Other devices can start a chat with this one.',
                ],
                [
                  'Private',
                  'Private',
                  'This device can call others but cannot receive calls.',
                ],
              ] as const
            ).map(([value, title, description]) => (
              <label
                key={value}
                className="flex min-h-16 cursor-pointer gap-3 rounded-xl border p-3 has-[:checked]:border-foreground has-[:checked]:bg-muted/50"
              >
                <input
                  type="radio"
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="mt-1 size-4 accent-foreground"
                />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={!valid}
          className="mt-6 h-11 w-full rounded-xl bg-foreground text-sm font-medium text-background hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Join your devices
        </button>
      </form>
    </main>
  );
}

export function DurableChat({
  snapshot,
  localName,
  onConnect,
  onDisconnect,
  onSend,
  onRefresh,
  onSignOut,
}: {
  readonly snapshot: DurableDemoSnapshot;
  readonly localName: string;
  readonly onConnect: (peerId: string) => void;
  readonly onDisconnect: (peerId: string) => void;
  readonly onSend: (peerId: string, text: string) => void;
  readonly onRefresh: () => void;
  readonly onSignOut: () => void;
}) {
  const peersById = new Map<string, (typeof snapshot.peers)[number]>(
    snapshot.peers.map((peer) => [peer.peerId, peer]),
  );

  return (
    <main className="min-h-svh bg-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex items-start justify-between gap-4 border-b pb-5">
          <div className="min-w-0">
            <a
              href="/demos"
              className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-4" />
              Demos
            </a>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Durable WebRTC
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              <strong className="font-medium text-foreground">
                {localName}
              </strong>{' '}
              · {snapshot.signaling}
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>

        <div className="grid gap-5 py-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="self-start rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Your active devices</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only peers signed in to this account appear here.
                </p>
              </div>
              <button
                type="button"
                onClick={onRefresh}
                disabled={snapshot.directory === 'loading'}
                className="grid size-11 shrink-0 place-items-center rounded-xl border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                aria-label="Refresh active devices"
              >
                <RefreshCw
                  className={`size-4 ${snapshot.directory === 'loading' ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            {snapshot.directory === 'error' ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                Couldn’t refresh your devices. Try again.
              </p>
            ) : snapshot.peers.length === 0 ? (
              <div className="mt-4 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                Open this demo on another device or tab, then refresh.
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {snapshot.peers.map((peer) => {
                  const connectable = peer.mode === 'Connectable';
                  return (
                    <li key={peer.peerId} className="rounded-xl border p-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                          {connectable ? (
                            <Radio className="size-4" />
                          ) : (
                            <LockKeyhole className="size-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {peer.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {connectable ? 'Available' : 'Private'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!connectable}
                        onClick={() => onConnect(peer.peerId)}
                        className="mt-3 h-11 w-full rounded-xl bg-foreground text-sm font-medium text-background hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                      >
                        {connectable ? 'Connect' : 'Not accepting calls'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <section aria-label="Conversations" className="min-w-0">
            {snapshot.conversations.length === 0 ? (
              <div className="grid min-h-[28rem] place-items-center rounded-2xl border border-dashed p-8 text-center">
                <div className="max-w-sm">
                  <Radio className="mx-auto size-6 text-muted-foreground" />
                  <h2 className="mt-4 font-semibold">
                    Choose an available device
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    WebRTC carries the conversation directly. The Durable Object
                    only helps both peers meet.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3">
                {snapshot.conversations.map((conversation) => (
                  <ConversationPanel
                    key={conversation.remoteId}
                    conversation={conversation}
                    localId={snapshot.localId}
                    title={peersById.get(conversation.remoteId)?.name}
                    onDisconnect={() => onDisconnect(conversation.remoteId)}
                    onSend={(text) => onSend(conversation.remoteId, text)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
