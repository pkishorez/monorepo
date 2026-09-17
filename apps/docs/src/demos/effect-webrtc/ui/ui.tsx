import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type { SessionStatus } from 'effect-webrtc';
import { AnimatePresence, motion, useReducedMotion } from 'kui-toolkit/motion';
import {
  Activity,
  ArrowLeft,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Monitor,
  Plus,
  Send,
  X,
} from 'lucide-react';

export interface ConversationSnapshot {
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

export interface ChatPeer {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
}

type Transport = 'nostr' | 'durable';

export function TransportSwitch({
  transport,
}: {
  readonly transport: Transport;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <nav
      aria-label="Signaling method"
      className="inline-flex rounded-xl bg-muted p-1"
    >
      <a
        href="/demos/webrtc?transport=nostr"
        aria-current={transport === 'nostr' ? 'page' : undefined}
        className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          transport === 'nostr'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {transport === 'nostr' ? (
          <motion.span
            layoutId="webrtc-transport"
            className="absolute inset-0 rounded-lg bg-background shadow-sm"
            transition={
              reducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 500, damping: 38 }
            }
          />
        ) : null}
        <span className="relative">Nostr</span>
      </a>
      <a
        href="/demos/webrtc?transport=durable"
        aria-current={transport === 'durable' ? 'page' : undefined}
        className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          transport === 'durable'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {transport === 'durable' ? (
          <motion.span
            layoutId="webrtc-transport"
            className="absolute inset-0 rounded-lg bg-background shadow-sm"
            transition={
              reducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 500, damping: 38 }
            }
          />
        ) : null}
        <span className="relative">My devices</span>
      </a>
    </nav>
  );
}

const statusTone = {
  Connecting: 'bg-amber-400 animate-pulse',
  Connected: 'bg-emerald-500',
  Reconnecting: 'bg-amber-400 animate-pulse',
} as const;

const statusText = ({ status }: ConversationSnapshot) => {
  if (status._tag === 'Connected') return 'Direct connection';
  const phase = status.phase?.replaceAll('-', ' ') ?? 'waiting for peer';
  return `${status._tag} · ${phase}`;
};

export function ConversationPanel({
  conversation,
  localId,
  title,
  otherUnread,
  onBack,
  onDisconnect,
  onSend,
}: {
  readonly conversation: ConversationSnapshot;
  readonly localId: string;
  readonly title?: string;
  readonly otherUnread: number;
  readonly onBack: () => void;
  readonly onDisconnect: () => void;
  readonly onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
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
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card">
      <header className="flex h-16 items-center justify-between gap-4 border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label={`Back to conversations${otherUnread > 0 ? `, ${otherUnread} unread messages` : ''}`}
            onClick={onBack}
            className="relative grid size-10 shrink-0 place-items-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <ArrowLeft className="size-4" />
            <AnimatePresence>
              {otherUnread > 0 ? (
                <motion.span
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-foreground px-1 text-[9px] font-semibold leading-4 tabular-nums text-background"
                >
                  {otherUnread > 99 ? '99+' : otherUnread}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </button>
          <div className="min-w-0">
            <h2 className="truncate font-semibold">
              {title ?? conversation.remoteId}
            </h2>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={`size-2 rounded-full ${statusTone[conversation.status._tag]}`}
              />
              {statusText(conversation)}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label={`Close chat with ${title ?? conversation.remoteId}`}
          className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onDisconnect}
        >
          <X className="size-4" />
        </button>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4"
        aria-live="polite"
      >
        {conversation.messages.length === 0 ? (
          <div className="grid flex-1 place-items-center text-center text-sm text-muted-foreground">
            {connected ? 'Say hello.' : 'Waiting for a direct connection…'}
          </div>
        ) : (
          conversation.messages.map((message) => {
            const own = message.author === localId;
            return (
              <div
                key={message.id}
                className={`flex max-w-[80%] flex-col gap-1 ${
                  own ? 'ml-auto items-end' : 'items-start'
                }`}
              >
                <p
                  className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
                    own
                      ? 'rounded-br-md bg-foreground text-background'
                      : 'rounded-bl-md bg-muted'
                  }`}
                >
                  {message.text}
                </p>
                {own && message.delivery !== 'delivered' ? (
                  <span className="px-1 text-[11px] capitalize text-muted-foreground">
                    {message.delivery}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <footer className="border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={500}
            rows={1}
            disabled={!connected}
            aria-label={`Message to ${conversation.remoteId}`}
            placeholder={connected ? 'Message' : 'Connecting…'}
            className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border bg-background px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          />
          <button
            type="button"
            onClick={send}
            disabled={!connected || draft.trim().length === 0}
            aria-label={`Send to ${conversation.remoteId}`}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-foreground text-background hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
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
    <main className="grid min-h-svh place-items-center bg-background p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm"
      >
        <TransportSwitch transport="nostr" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Pick a chat name
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Share it with someone so they can reach you through Nostr.
        </p>
        <input
          autoFocus
          value={id}
          onChange={(event) => setId(event.target.value)}
          maxLength={64}
          placeholder="alice"
          aria-label="Your chat name"
          className="mt-5 h-11 w-full rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
        />
        <button
          type="submit"
          disabled={!valid}
          className="mt-3 h-11 w-full rounded-xl bg-foreground text-sm font-medium text-background disabled:opacity-40"
        >
          Start chatting
        </button>
      </form>
    </main>
  );
}

interface WebRtcChatProps {
  readonly transport: Transport;
  readonly snapshot: DemoSnapshot;
  readonly localName: string;
  readonly peers?: ReadonlyArray<ChatPeer>;
  readonly directory?: 'loading' | 'ready' | 'error';
  readonly onConnect: (remoteId: string) => void;
  readonly onDisconnect: (remoteId: string) => void;
  readonly onSend: (remoteId: string, text: string) => void;
  readonly onSignOut?: () => void;
  readonly onFlows?: () => void;
  readonly instanceValue?: number | null;
  readonly probingInstance?: boolean;
  readonly onProbeInstance?: () => void;
}

export function WebRtcChat({
  transport,
  snapshot,
  localName,
  peers = [],
  directory,
  onConnect,
  onDisconnect,
  onSend,
  onSignOut,
  onFlows,
  instanceValue,
  probingInstance,
  onProbeInstance,
}: WebRtcChatProps) {
  const [remoteId, setRemoteId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia('(min-width: 64rem)').matches,
  );
  const previousMessages = useRef(new Map<string, number>());
  const peerNames = useRef(new Map<string, string>());
  const normalized = remoteId.trim().toLowerCase();
  const valid =
    /^[a-z0-9_-]{1,64}$/.test(normalized) && normalized !== snapshot.localId;
  const peerById = new Map(peers.map((peer) => [peer.id, peer]));
  for (const peer of peers) peerNames.current.set(peer.id, peer.name);
  const visibleConversations =
    transport === 'durable'
      ? snapshot.conversations.filter(({ remoteId }) => peerById.has(remoteId))
      : snapshot.conversations;
  const selectedConversation = snapshot.conversations.find(
    ({ remoteId: id }) => id === selectedId,
  );
  const displayedConversation = selectedConversation ?? visibleConversations[0];
  const activeConversation =
    selectedConversation ?? (isDesktop ? visibleConversations[0] : undefined);
  const contacts =
    transport === 'durable'
      ? peers
      : [
          ...peers,
          ...snapshot.conversations
            .filter(({ remoteId: id }) => !peerById.has(id))
            .map(({ remoteId: id }) => ({
              id,
              name: id,
              available: true,
            })),
        ];
  const previousContacts =
    transport === 'durable'
      ? snapshot.conversations
          .filter(({ remoteId }) => !peerById.has(remoteId))
          .flatMap(({ remoteId }) => {
            const name = peerNames.current.get(remoteId);
            return name === undefined ? [] : [{ id: remoteId, name }];
          })
      : [];
  const contactSections =
    transport === 'durable'
      ? [
          {
            title: 'Active chats',
            contacts: contacts.filter((peer) =>
              snapshot.conversations.some(
                ({ remoteId }) => remoteId === peer.id,
              ),
            ),
          },
          {
            title: 'Devices',
            contacts: contacts.filter(
              (peer) =>
                !snapshot.conversations.some(
                  ({ remoteId }) => remoteId === peer.id,
                ),
            ),
          },
        ].filter(({ contacts: sectionContacts }) => sectionContacts.length > 0)
      : [{ title: undefined, contacts }];
  const otherUnread = Object.entries(unread).reduce(
    (total, [id, count]) =>
      id === displayedConversation?.remoteId ? total : total + count,
    0,
  );
  useEffect(() => {
    const media = window.matchMedia('(min-width: 64rem)');
    const update = () => setIsDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const activeId = activeConversation?.remoteId;
    setUnread((current) => {
      const next = { ...current };
      for (const conversation of snapshot.conversations) {
        const previous =
          previousMessages.current.get(conversation.remoteId) ?? 0;
        if (conversation.remoteId !== activeId) {
          const incoming = conversation.messages
            .slice(previous)
            .filter(({ author }) => author !== snapshot.localId).length;
          if (incoming > 0)
            next[conversation.remoteId] =
              (next[conversation.remoteId] ?? 0) + incoming;
        }
        previousMessages.current.set(
          conversation.remoteId,
          conversation.messages.length,
        );
      }
      if (activeId !== undefined) next[activeId] = 0;
      return next;
    });
  }, [activeConversation?.remoteId, snapshot.conversations, snapshot.localId]);
  const connect = (id: string) => {
    setSelectedId(id);
    setUnread((current) => ({ ...current, [id]: 0 }));
    if (!snapshot.conversations.some(({ remoteId }) => remoteId === id))
      onConnect(id);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    connect(normalized);
    setRemoteId('');
  };

  return (
    <main className="h-dvh overflow-hidden bg-background lg:grid lg:place-items-center lg:p-6">
      <div className="h-full w-full overflow-hidden bg-card lg:h-[min(40rem,calc(100dvh-5rem))] lg:max-w-4xl lg:rounded-2xl lg:border lg:shadow-sm">
        <div className="grid h-full min-h-0 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside
            className={`${selectedConversation ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-r bg-card`}
          >
            <header className="border-b p-4">
              <div className="flex items-center gap-2">
                <a
                  href="/demos"
                  aria-label="Back to demos"
                  className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeft className="size-4" />
                </a>
                <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
                  WebRTC chat
                </h1>
              </div>
              <div className="mt-3">
                <TransportSwitch transport={transport} />
              </div>
            </header>

            {transport === 'nostr' ? (
              <div className="border-b p-3">
                <form onSubmit={submit}>
                  <label
                    htmlFor="remote-peer"
                    className="mb-2 block text-xs font-medium text-muted-foreground"
                  >
                    New chat
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="remote-peer"
                      value={remoteId}
                      onChange={(event) => setRemoteId(event.target.value)}
                      placeholder="Peer name"
                      maxLength={64}
                      className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                    />
                    <button
                      type="submit"
                      disabled={!valid}
                      aria-label="Start new chat"
                      className="grid size-11 shrink-0 place-items-center rounded-xl bg-foreground text-background active:scale-95 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {directory === 'error' ? (
                <p role="alert" className="m-2 text-sm text-destructive">
                  Couldn’t load your devices. Refresh to try again.
                </p>
              ) : (
                <>
                  {contacts.length === 0 ? (
                    <div className="m-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                      {directory === 'loading'
                        ? 'Looking for your devices…'
                        : transport === 'nostr'
                          ? 'Start by entering a peer name.'
                          : 'No other devices are connected.'}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {contactSections.map((section) => (
                        <section key={section.title ?? 'conversations'}>
                          {section.title ? (
                            <h2 className="px-1 text-xs font-medium text-muted-foreground">
                              {section.title}
                            </h2>
                          ) : null}
                          <ul
                            className={`${section.title ? 'mt-1' : ''} space-y-1`}
                          >
                            {section.contacts.map((peer) => {
                              const conversation = snapshot.conversations.find(
                                ({ remoteId }) => remoteId === peer.id,
                              );
                              const selected =
                                displayedConversation?.remoteId === peer.id;
                              return (
                                <li key={peer.id}>
                                  <button
                                    type="button"
                                    disabled={
                                      !peer.available &&
                                      conversation === undefined
                                    }
                                    onClick={() => connect(peer.id)}
                                    className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
                                      selected
                                        ? 'bg-muted font-medium'
                                        : 'hover:bg-muted/60'
                                    }`}
                                  >
                                    {!peer.available &&
                                    conversation === undefined ? (
                                      <LockKeyhole className="size-3.5 shrink-0" />
                                    ) : conversation ? (
                                      <MessageCircle className="size-3.5 shrink-0 text-muted-foreground" />
                                    ) : (
                                      <Monitor className="size-3.5 shrink-0 text-muted-foreground" />
                                    )}
                                    <span className="min-w-0 flex-1 truncate">
                                      {peer.name}
                                    </span>
                                    {conversation ? (
                                      <span className="text-xs text-muted-foreground">
                                        {conversation.status._tag ===
                                        'Connected'
                                          ? 'Direct'
                                          : 'Connecting'}
                                      </span>
                                    ) : null}
                                    <AnimatePresence>
                                      {(unread[peer.id] ?? 0) > 0 ? (
                                        <motion.span
                                          initial={{ opacity: 0, scale: 0.7 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          exit={{ opacity: 0, scale: 0.7 }}
                                          aria-label={`${unread[peer.id]} unread messages`}
                                          className="grid min-w-5 place-items-center rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-background"
                                        >
                                          {unread[peer.id]}
                                        </motion.span>
                                      ) : null}
                                    </AnimatePresence>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ))}
                    </div>
                  )}
                  {previousContacts.length > 0 ? (
                    <section className="mt-4 border-t pt-4">
                      <h2 className="px-1 text-xs font-medium text-muted-foreground">
                        Previously connected
                      </h2>
                      <ul className="mt-1 space-y-1">
                        {previousContacts.map((peer) => (
                          <li key={peer.id}>
                            <button
                              type="button"
                              onClick={() => connect(peer.id)}
                              className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-sm opacity-50 active:scale-[0.99] ${
                                displayedConversation?.remoteId === peer.id
                                  ? 'bg-muted font-medium'
                                  : 'hover:bg-muted/60'
                              }`}
                            >
                              <Monitor className="size-3.5 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate line-through decoration-muted-foreground/70">
                                {peer.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Offline
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </>
              )}
            </div>

            {onProbeInstance ? (
              <button
                type="button"
                onClick={onProbeInstance}
                disabled={probingInstance}
                className="flex min-h-14 items-center justify-between gap-3 border-t px-4 py-2 text-left hover:bg-muted/60 active:bg-muted disabled:cursor-wait"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium">
                    DO wake probe
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    After idle, 0 means a new activation.
                  </span>
                </span>
                <code className="shrink-0 text-xs tabular-nums">
                  {probingInstance ? '…' : (instanceValue ?? 'Run')}
                </code>
              </button>
            ) : null}

            <footer className="flex items-center gap-2 border-t px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{localName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {snapshot.signaling}
                </p>
              </div>
              {onFlows ? (
                <button
                  type="button"
                  onClick={onFlows}
                  aria-label="Open connection flows"
                  className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-muted active:scale-95"
                >
                  <Activity className="size-4" />
                </button>
              ) : null}
              {onSignOut ? (
                <button
                  type="button"
                  onClick={onSignOut}
                  aria-label="Sign out"
                  className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-muted active:scale-95"
                >
                  <LogOut className="size-4" />
                </button>
              ) : null}
            </footer>
          </aside>

          <div
            className={`${selectedConversation ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 bg-card`}
          >
            {displayedConversation ? (
              <ConversationPanel
                conversation={displayedConversation}
                localId={snapshot.localId}
                title={
                  peerById.get(displayedConversation.remoteId)?.name ??
                  peerNames.current.get(displayedConversation.remoteId)
                }
                otherUnread={otherUnread}
                onBack={() => setSelectedId(null)}
                onDisconnect={() => {
                  onDisconnect(displayedConversation.remoteId);
                  setSelectedId(null);
                }}
                onSend={(text) => onSend(displayedConversation.remoteId, text)}
              />
            ) : (
              <section className="grid h-full flex-1 place-items-center p-8 text-center">
                <div className="max-w-xs">
                  <h2 className="font-semibold">No chat selected</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {transport === 'nostr'
                      ? 'Enter a peer name to start chatting.'
                      : 'Choose one of your available devices.'}
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export function EffectWebRtcDemo({
  snapshot,
  onConnect,
  onDisconnect,
  onSend,
  onFlows,
}: {
  readonly snapshot: DemoSnapshot;
  readonly onConnect: (remoteId: string) => void;
  readonly onDisconnect: (remoteId: string) => void;
  readonly onSend: (remoteId: string, text: string) => void;
  readonly onFlows: () => void;
}) {
  return (
    <WebRtcChat
      transport="nostr"
      snapshot={snapshot}
      localName={snapshot.localId}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      onSend={onSend}
      onFlows={onFlows}
    />
  );
}
