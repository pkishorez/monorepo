import { useFixtureInput } from 'react-cosmos/client';
import { Button } from '#components/ui/button';
import {
  DEFAULT_GESTURE_SPRING,
  GestureProvider,
  type GestureSpring,
} from '../gestures';
import {
  PwaPlaygroundInbox,
  PwaPlaygroundSidebar,
  usePwaPlaygroundSidebar,
} from './index';

const useSpringControls = (): GestureSpring => {
  const [stiffness] = useFixtureInput(
    'Stiffness',
    DEFAULT_GESTURE_SPRING.stiffness,
  );
  const [damping] = useFixtureInput('Damping', DEFAULT_GESTURE_SPRING.damping);
  const [mass] = useFixtureInput('Mass', DEFAULT_GESTURE_SPRING.mass);
  return {
    stiffness: Math.max(1, stiffness),
    damping: Math.max(1, damping),
    mass: Math.max(0.1, mass),
  };
};

function TuningNote({ spring }: { readonly spring: GestureSpring }) {
  return (
    <div className="shrink-0 border-b border-border bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
      <strong className="text-foreground">Spring curve</strong>
      <p>
        Gesture settles use a spring so release velocity survives. Change the
        Cosmos controls, then drag again to feel the new curve.
      </p>
      <code className="mt-1 block font-mono text-foreground">
        {`{ stiffness: ${spring.stiffness}, damping: ${spring.damping}, mass: ${spring.mass} }`}
      </code>
    </div>
  );
}

function SidebarContent() {
  const sidebar = usePwaPlaygroundSidebar();
  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <strong className="text-sm">PWA Playground</strong>
        <Button size="sm" onClick={sidebar.open}>
          Open sidebar
        </Button>
      </header>
      <main className="grid flex-1 content-start gap-3 p-4">
        <div className="h-28 rounded-xl bg-muted" />
        <div className="h-20 rounded-xl bg-muted" />
        <p className="text-sm text-muted-foreground">
          Swipe right anywhere, release at different speeds, and reverse it
          before it lands.
        </p>
      </main>
    </>
  );
}

function SidebarFixture() {
  const spring = useSpringControls();
  return (
    <div className="mx-auto grid min-h-svh max-w-md place-items-center p-4">
      <div className="relative flex h-[min(720px,calc(100svh-2rem))] w-full flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
        <TuningNote spring={spring} />
        <GestureProvider scroll="none" className="relative min-h-0 flex-1">
          <PwaPlaygroundSidebar
            contained
            spring={spring}
            panel={
              <div className="flex h-full flex-col gap-2 p-4">
                <strong className="mb-2 text-sm">Gesture Lab</strong>
                {['Matrix', 'Inbox', 'Photos', 'Map', 'Sidebar'].map((item) => (
                  <div key={item} className="rounded-lg px-3 py-2 text-sm">
                    {item}
                  </div>
                ))}
              </div>
            }
          >
            <SidebarContent />
          </PwaPlaygroundSidebar>
        </GestureProvider>
      </div>
    </div>
  );
}

function InboxFixture() {
  const spring = useSpringControls();
  return (
    <div className="mx-auto grid min-h-svh max-w-md place-items-center p-4">
      <div className="flex h-[min(720px,calc(100svh-2rem))] w-full flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
        <TuningNote spring={spring} />
        <GestureProvider scroll="none" className="min-h-0 flex-1">
          <PwaPlaygroundInbox
            spring={spring}
            refreshDelayMs={500}
            initialCount={16}
          />
        </GestureProvider>
      </div>
    </div>
  );
}

export default {
  'Sidebar spring': <SidebarFixture />,
  'Inbox spring': <InboxFixture />,
};
