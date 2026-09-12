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
import { EffectWebRtcDemo } from '../../ui/index.ts';

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
    Preparing Alice and Bob…
  </main>
);

export function EffectWebRtcPage() {
  const [boot] = useState(bootConversation);
  return (
    <Suspense fallback={<Loading />}>
      <BootedConversation boot={boot} />
    </Suspense>
  );
}
