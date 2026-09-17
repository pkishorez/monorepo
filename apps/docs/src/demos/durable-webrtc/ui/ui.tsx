import { useState, type FormEvent } from 'react';
import type { PeerMode } from 'effect-webrtc/signaling/durable';
import { LogOut } from 'lucide-react';
import {
  TransportSwitch,
  WebRtcChat,
  type ChatPeer,
} from '../../effect-webrtc/ui/index.ts';
import type { DurableDemoSnapshot } from '../runtime/index.ts';

export { TransportSwitch };

export function PeerProfile({
  accountName,
  initialName,
  onJoin,
  onSignOut,
}: {
  readonly accountName: string;
  readonly initialName: string;
  readonly onJoin: (name: string, mode: PeerMode) => void;
  readonly onSignOut: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [privateMode, setPrivateMode] = useState(false);
  const valid = name.trim().length > 0 && name.trim().length <= 80;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) onJoin(name.trim(), privateMode ? 'Private' : 'Connectable');
  };

  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-12">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <TransportSwitch transport="durable" />
          <button
            type="button"
            onClick={onSignOut}
            className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Name this device
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Signed in as {accountName}. Your other devices will see this name.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Work laptop"
          aria-label="Device name"
          className="mt-5 h-11 w-full rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
        />
        <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 text-sm">
          <span>
            <span className="block font-medium">Private device</span>
            <span className="text-xs text-muted-foreground">
              Start chats, but don’t appear available.
            </span>
          </span>
          <input
            type="checkbox"
            checked={privateMode}
            onChange={(event) => setPrivateMode(event.target.checked)}
            className="size-4 accent-foreground"
          />
        </label>
        <button
          type="submit"
          disabled={!valid}
          className="mt-5 h-11 w-full rounded-xl bg-foreground text-sm font-medium text-background disabled:opacity-40"
        >
          Start chatting
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
  onSignOut,
  onFlows,
  onProbeInstance,
}: {
  readonly snapshot: DurableDemoSnapshot;
  readonly localName: string;
  readonly onConnect: (peerId: string) => void;
  readonly onDisconnect: (peerId: string) => void;
  readonly onSend: (peerId: string, text: string) => void;
  readonly onSignOut: () => void;
  readonly onFlows: () => void;
  readonly onProbeInstance: () => Promise<number>;
}) {
  const [instanceValue, setInstanceValue] = useState<number | null>(null);
  const [probing, setProbing] = useState(false);
  const peers: ReadonlyArray<ChatPeer> = snapshot.peers.map((peer) => ({
    id: peer.peerId,
    name: peer.name,
    available: peer.mode === 'Connectable',
  }));

  return (
    <WebRtcChat
      transport="durable"
      snapshot={snapshot}
      localName={localName}
      peers={peers}
      directory={snapshot.directory}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      onSend={onSend}
      onSignOut={onSignOut}
      onFlows={onFlows}
      instanceValue={instanceValue}
      probingInstance={probing}
      onProbeInstance={() => {
        if (probing) return;
        setProbing(true);
        void onProbeInstance()
          .then(setInstanceValue, () => setInstanceValue(null))
          .finally(() => setProbing(false));
      }}
    />
  );
}
