import {
  Suspense,
  use,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { DevToolsPanel } from 'kui-toolkit/components/blocks/devtools-panel';
import {
  bootConversation,
  type ConversationRuntime,
} from '../../runtime/index.ts';
import { EffectWebRtcDemo, PeerSetup } from '../../ui/index.ts';

const chatNameKey = 'effect-webrtc-chat-name';
const validChatName = (value: string | null): value is string =>
  value !== null && /^[a-z0-9_-]{1,64}$/.test(value);

function LiveConversation({
  runtime,
}: {
  readonly runtime: ConversationRuntime;
}) {
  const [flows, setFlows] = useState(false);
  const mounted = useRef(false);
  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) void runtime.dispose();
      });
    };
  }, [runtime]);

  return (
    <>
      <EffectWebRtcDemo
        snapshot={snapshot}
        onConnect={runtime.connect}
        onDisconnect={runtime.disconnect}
        onSend={runtime.send}
        onFlows={() => setFlows(true)}
      />
      <DevToolsPanel
        runtime={runtime.runtime}
        recorder={runtime.recorder}
        filters={['flows']}
        open={flows}
        onClose={() => setFlows(false)}
      />
    </>
  );
}

function BootedConversation({
  boot,
}: {
  readonly boot: Promise<ConversationRuntime>;
}) {
  return <LiveConversation runtime={use(boot)} />;
}

const Loading = () => (
  <main className="grid min-h-svh place-items-center bg-background text-sm text-muted-foreground">
    Connecting to Nostr relays…
  </main>
);

export function EffectWebRtcPage() {
  const [boot, setBoot] = useState<Promise<ConversationRuntime> | null>(() => {
    const saved = localStorage.getItem(chatNameKey);
    return validChatName(saved) ? bootConversation(saved) : null;
  });
  if (boot === null)
    return (
      <PeerSetup
        onSetup={(id) => {
          localStorage.setItem(chatNameKey, id);
          setBoot(bootConversation(id));
        }}
      />
    );
  return (
    <Suspense fallback={<Loading />}>
      <BootedConversation boot={boot} />
    </Suspense>
  );
}
