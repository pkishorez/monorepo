import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRightIcon } from '@kstackz/ui-toolkit/lucide';
import { ScenarioPage } from '../components/index.ts';

export const Route = createFileRoute('/gestures/')({ component: Gestures });

type Page = {
  readonly to:
    | '/gestures/lab'
    | '/gestures/swipe'
    | '/gestures/sidebar'
    | '/gestures/pull-to-refresh';
  readonly title: string;
  readonly summary: string;
};

type Layer = {
  readonly name: string;
  readonly blurb: string;
  readonly pages: ReadonlyArray<Page>;
};

const LAYERS: ReadonlyArray<Layer> = [
  {
    name: 'Patterns',
    blurb:
      'Whole touch behaviours an app uses as they are, on real screens. Start here.',
    pages: [
      {
        to: '/gestures/sidebar',
        title: 'useSidebar',
        summary:
          'An inbox whose sidebar opens from its edge, follows the finger and settles by momentum.',
      },
      {
        to: '/gestures/pull-to-refresh',
        title: 'usePullToRefresh',
        summary:
          'An inbox you pull down with resistance, armed past a distance, holding while it refreshes.',
      },
    ],
  },
  {
    name: 'Recognizers',
    blurb:
      'One generic meaning read from a touch, with live feedback: what the Patterns are built from.',
    pages: [
      {
        to: '/gestures/swipe',
        title: 'useSwipe',
        summary:
          'Nine Cases: directions, finger counts, flicks, the commit rule, edges, scrollers and Swipes side by side.',
      },
    ],
  },
  {
    name: 'Core',
    blurb:
      'Every finger of a touch and nothing else: zones, nesting, trapping and useGesture.',
    pages: [
      {
        to: '/gestures/lab',
        title: 'Gesture Lab',
        summary:
          'Ten Cases of nested zones, trapping and useGesture, every finger drawn.',
      },
    ],
  },
];

function Gestures() {
  return (
    <ScenarioPage
      id="gestures"
      title="Gestures: three layers of @kstackz/use-gesture"
      proves={
        <>
          <p>
            The core reports every finger and never decides what a touch means.
            Recognizers read one meaning from it, such as a Swipe. Patterns are
            whole behaviours built from Recognizers, such as a sidebar. Each
            layer uses only the one below.
          </p>
          <p>
            Each page is full screen and works best on a phone. Every one has a
            guide saying what to try and what should happen.
          </p>
        </>
      }
    >
      <div className="flex flex-col divide-y divide-border border-y border-border">
        {LAYERS.map((layer) => (
          <section
            key={layer.name}
            aria-label={layer.name}
            className="grid gap-3 py-6 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-8"
          >
            <div className="flex flex-col gap-1.5">
              <h2 className="text-base font-semibold tracking-tight">
                {layer.name}
              </h2>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {layer.blurb}
              </p>
            </div>
            <ul className="flex flex-col gap-1">
              {layer.pages.map((page) => (
                <li key={page.to}>
                  <Link
                    to={page.to}
                    className="group -mx-3 flex min-h-14 items-center gap-4 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-mono font-medium">
                        {page.title}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {page.summary}
                      </span>
                    </span>
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ScenarioPage>
  );
}
