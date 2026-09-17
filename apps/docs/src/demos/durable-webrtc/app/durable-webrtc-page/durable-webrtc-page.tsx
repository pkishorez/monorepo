import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { generatePeerId, type PeerId as PeerIdentifier } from 'effect-webrtc';
import type { PeerMode } from 'effect-webrtc/signaling/durable';
import { useTheme } from 'fumadocs-ui/provider/base';
import { DevToolsPanel } from 'kui-toolkit/components/blocks/devtools-panel';
import { GoogleButton } from 'kui-toolkit/components/ui/google-button';
import { LoaderCircle } from 'lucide-react';
import { authClient } from '../../auth/index.ts';
import {
  bootDurableConversation,
  type DurableConversationRuntime,
} from '../../runtime/index.ts';
import { DurableChat, PeerProfile, TransportSwitch } from '../../ui/index.ts';

function CenteredCard({ children }: { readonly children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-12">
      <section className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        {children}
      </section>
    </main>
  );
}

interface DeviceProfile {
  readonly name: string;
  readonly mode: PeerMode;
  readonly peerId: PeerIdentifier;
}

const deviceNameKey = (userId: string) =>
  `durable-webrtc-device-name:${userId}`;

const storedDeviceName = (userId: string): string => {
  const name = localStorage.getItem(deviceNameKey(userId)) ?? '';
  return name.trim().length > 0 && name.length <= 80 ? name : '';
};

function SignIn() {
  const { resolvedTheme } = useTheme();
  const loginError = authClient.useLoginError();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    loginError.dismiss();
    try {
      const result = await authClient.signIn.google();
      if (result.error) {
        setError(result.error.message ?? 'Sign in didn’t complete. Try again.');
      }
    } catch {
      setError('The sign-in service didn’t respond. Try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <CenteredCard>
      <TransportSwitch transport="durable" />
      <p className="mt-6 text-sm font-medium text-muted-foreground">
        WebRTC demo
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Chat between your devices
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Sign in to discover only your active peers. Signaling uses a dedicated
        Durable Object; messages travel peer to peer.
      </p>
      <div className="mt-6 w-fit">
        <GoogleButton
          theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
          onClick={() => void signIn()}
          disabled={pending}
          aria-busy={pending || undefined}
        />
      </div>
      {(error ?? loginError.error?.description) ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error ?? loginError.error?.description}
        </p>
      ) : null}
    </CenteredCard>
  );
}

function LiveConversation({
  runtime,
  name,
  onSignOut,
}: {
  readonly runtime: DurableConversationRuntime;
  readonly name: string;
  readonly onSignOut: () => void;
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
      <DurableChat
        snapshot={snapshot}
        localName={name}
        onConnect={runtime.connect}
        onDisconnect={runtime.disconnect}
        onSend={runtime.send}
        onSignOut={onSignOut}
        onFlows={() => setFlows(true)}
        onProbeInstance={runtime.probeInstance}
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

function AuthenticatedDemo({
  userId,
  accountName,
}: {
  readonly userId: string;
  readonly accountName: string;
}) {
  const [profile, setProfile] = useState<DeviceProfile | null>(null);
  const [runtime, setRuntime] = useState<DurableConversationRuntime | null>(
    null,
  );
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (profile === null) return;
    let active = true;
    setBootError(null);
    void bootDurableConversation(profile).then(
      (next) => {
        if (active) setRuntime(next);
        else void next.dispose();
      },
      (error) => {
        console.error('Failed to start durable WebRTC demo', error);
        if (active) setBootError('Couldn’t connect to the signaling server.');
      },
    );
    return () => {
      active = false;
    };
  }, [profile]);

  const signOut = () => void authClient.signOut();

  if (profile === null) {
    return (
      <PeerProfile
        accountName={accountName}
        initialName={storedDeviceName(userId)}
        onSignOut={signOut}
        onJoin={(name, mode) => {
          localStorage.setItem(deviceNameKey(userId), name);
          setProfile({ name, mode, peerId: generatePeerId() });
        }}
      />
    );
  }

  if (bootError) {
    return (
      <CenteredCard>
        <h1 className="text-xl font-semibold">Couldn’t join your devices</h1>
        <p role="alert" className="mt-2 text-sm text-muted-foreground">
          {bootError} Check the deployment and try again.
        </p>
        <button
          type="button"
          onClick={() => setProfile(null)}
          className="mt-5 h-11 w-full rounded-xl bg-foreground text-sm font-medium text-background"
        >
          Try again
        </button>
      </CenteredCard>
    );
  }

  if (runtime === null) {
    return (
      <CenteredCard>
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" />
          Joining your devices…
        </p>
      </CenteredCard>
    );
  }

  return (
    <LiveConversation
      runtime={runtime}
      name={profile.name}
      onSignOut={signOut}
    />
  );
}

export function DurableWebRtcPage() {
  const session = authClient.useSession();

  if (session.isPending) {
    return (
      <CenteredCard>
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" />
          Checking your session…
        </p>
      </CenteredCard>
    );
  }

  if (session.error) {
    return (
      <CenteredCard>
        <h1 className="text-xl font-semibold">Couldn’t check your session</h1>
        <button
          type="button"
          onClick={() => void session.refetch()}
          className="mt-5 h-11 w-full rounded-xl bg-foreground text-sm font-medium text-background"
        >
          Retry
        </button>
      </CenteredCard>
    );
  }

  if (!session.data) return <SignIn />;

  return (
    <AuthenticatedDemo
      userId={session.data.user.id}
      accountName={session.data.user.name || session.data.user.email}
    />
  );
}
