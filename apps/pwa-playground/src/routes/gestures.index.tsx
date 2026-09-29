import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRightIcon } from '@kstackz/ui-toolkit/lucide';
import { Code, Page } from '../components/index.ts';

export const Route = createFileRoute('/gestures/')({ component: Gestures });

type Layer = {
  readonly name: string;
  readonly from: string;
  readonly body: string;
  readonly hooks: ReadonlyArray<{
    readonly name: string;
    readonly to: string;
    readonly what: string;
  }>;
};

// Top to bottom: reach for the highest layer that fits.
const LAYERS: ReadonlyArray<Layer> = [
  {
    name: 'Patterns',
    from: '@kstackz/use-gesture',
    body: 'Whole touch behaviours, used as they are. Each returns motion values and state; you render them however you like.',
    hooks: [
      {
        name: 'useSidebar',
        to: '/gestures/sidebar',
        what: 'a drawer that follows the finger',
      },
      {
        name: 'usePullToRefresh',
        to: '/gestures/pull-to-refresh',
        what: 'pull, arm, refresh',
      },
    ],
  },
  {
    name: 'Recognizers',
    from: '@kstackz/use-gesture/recognizers',
    body: 'One generic meaning read from a touch, with live feedback while it happens and a verdict at release. Patterns are built from these.',
    hooks: [
      {
        name: 'useSwipe',
        to: '/gestures/swipe',
        what: 'one direction, a finger count, a rule',
      },
    ],
  },
  {
    name: 'Core',
    from: '@kstackz/use-gesture/core',
    body: 'Every finger of a touch and nothing else, inside zones that decide who hears it. It never says what a touch means.',
    hooks: [
      {
        name: 'useGesture',
        to: '/gestures/zones',
        what: 'zones, trapping and every finger',
      },
    ],
  },
];

const APP_CODE = `// shell/app-shell.tsx: one provider, one zone for the whole app
<GestureProvider>
  <GestureZone className="fixed inset-0">
    <Frame />  {/* the hooks below live here */}
  </GestureZone>
</GestureProvider>

const touch = useMedia('(pointer: coarse)'); // fingers only, never a mouse

// The menu opens from the left edge.
const menu = useSidebar({ side: 'left', width: 288, edge: 24, enabled: touch });

// Two Swipes turn the page; one that starts in the edge is the menu's.
const toNext = useSwipe({ direction: 'left', enabled: touch, onCommit: next });
const toPrev = useSwipe({ direction: 'right', enabled: touch, onCommit: prev });

// A pull at the top reloads the route's data.
const pull = usePullToRefresh({ enabled: touch, onRefresh: () => router.invalidate() });

// Every demo is <GestureZone trapped>: its touches never turn the page.`;

function Gestures() {
  return (
    <Page
      path="/gestures"
      testId="scenario-gestures"
      lede={
        <>
          <p>
            A native app owns every touch. A web page shares them with the
            browser, which wants to scroll, zoom and go back. use-gesture takes
            touches for the app only where you say so, and leaves the rest to
            the browser.
          </p>
          <p>
            It comes in three layers. Each one is built only on the one below.
          </p>
        </>
      }
    >
      <ol className="flex flex-col">
        {LAYERS.map((layer, i) => (
          <li
            key={layer.name}
            className="grid gap-x-6 gap-y-3 border-t border-border py-7 sm:grid-cols-[3.5rem_minmax(0,1fr)]"
          >
            <span
              aria-hidden="true"
              className="font-display text-3xl leading-none text-muted-foreground/70 tabular-nums"
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="flex max-w-[60ch] flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-2xl font-medium">
                  {layer.name}
                </h2>
                <code className="w-fit font-mono text-xs text-muted-foreground">
                  {layer.from}
                </code>
              </div>
              <p className="text-[17px] leading-relaxed text-pretty text-muted-foreground">
                {layer.body}
              </p>
              <ul className="flex flex-col">
                {layer.hooks.map((hook) => (
                  <li key={hook.name}>
                    <Link
                      to={hook.to}
                      className="group -mx-3 flex min-h-12 items-center gap-3 rounded-lg px-3 transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="font-mono text-sm font-medium">
                        {hook.name}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                        {hook.what}
                      </span>
                      <ArrowRightIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <h2 className="font-display text-2xl font-medium">In this app</h2>
        <p className="max-w-[60ch] text-[17px] leading-relaxed text-pretty text-muted-foreground">
          Everything you swipe in this app is one provider, one zone and a few
          hooks. Demo stages are trapped zones inside it, so the app and the
          demos never fight over a touch.
        </p>
        <Code title="How the app wires it" code={APP_CODE} />
      </section>
    </Page>
  );
}
