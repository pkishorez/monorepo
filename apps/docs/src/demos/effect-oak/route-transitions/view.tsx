import type { ReactNode } from 'react';
import { View } from 'effect-oak/react';
import { Link } from '../location/index.js';
import { CatalogView, PaintingPage } from './gallery/index.js';
import { RouteTransitions } from './route-transitions.js';
import { StudioView } from './studio/index.js';
import { TransitionLog } from './transition-log/index.js';

type Drawn = {
  readonly model: {
    readonly path: string;
    readonly log: Parameters<typeof TransitionLog>[0]['log'];
  };
  readonly state: { readonly _tag: string };
  readonly send: (message: {
    readonly _tag: 'ClickedLink';
    readonly path: string;
  }) => void;
};

const SECTIONS = [
  { label: 'Home', to: '/', tags: ['Home'] },
  { label: 'Gallery', to: '/gallery', tags: ['Gallery', 'Painting'] },
  { label: 'Studio', to: '/studio', tags: ['Studio'] },
] as const;

/** One route's page beside the log, its links Sending `ClickedLink`. */
const page =
  <P extends Drawn>(
    draw: (props: P, go: (path: string) => void) => ReactNode,
  ) =>
  (props: P) => {
    const go = (path: string) => props.send({ _tag: 'ClickedLink', path });
    return (
      <div className="flex size-full flex-col overflow-hidden sm:rounded-lg sm:border">
        <nav className="flex flex-wrap items-center gap-1 border-b px-4 py-2">
          {SECTIONS.map((section) => {
            const current = (section.tags as ReadonlyArray<string>).includes(
              props.state._tag,
            );
            return (
              <Link
                key={section.label}
                to={section.to}
                onNavigate={go}
                current={current}
                className={`rounded-md px-3 py-1 text-sm font-medium hover:bg-muted ${current ? 'bg-muted' : 'text-muted-foreground'}`}
              >
                {section.label}
              </Link>
            );
          })}
          <code className="ml-auto truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            #{props.model.path}
          </code>
        </nav>
        <div className="grid flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-[1fr_16rem]">
          <main>{draw(props, go)}</main>
          <TransitionLog log={props.model.log} />
        </div>
      </div>
    );
  };

const HomePage = () => (
  <section className="flex flex-col gap-4 text-muted-foreground">
    <h1 className="text-3xl font-semibold text-foreground">
      Route Transitions
    </h1>
    <p>
      Every route change is logged on the right, starting with the cold load
      that brought you here. Things to try:
    </p>
    <ul className="list-disc space-y-2 pl-6">
      <li>
        Open the Gallery. Entering it loads the catalog; going back and forth
        loads it again only on each fresh entry.
      </li>
      <li>
        Open a painting and flip to the next one. Staying on the Painting route
        is not an entry, so only the changed painting loads.
      </li>
      <li>Write a draft in the Studio and leave: leaving saves it.</li>
      <li>Reload anywhere: a cold load still counts as an entry.</li>
    </ul>
  </section>
);

export const RouteTransitionsView = View.make(RouteTransitions, {
  Opening: () => null,
  Home: page(() => <HomePage />),
  Gallery: page(({ children, frame }) => (
    <CatalogView node={children.catalog} frame={frame} />
  )),
  Painting: page(({ state }, go) => (
    <PaintingPage
      paintingId={state.paintingId}
      ready={state.ready}
      onNavigate={go}
    />
  )),
  Studio: page(({ model, children, frame }) => (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">Studio</h1>
      <p className="text-muted-foreground">
        Write something, then leave. Leaving this page saves whatever is here.
      </p>
      <StudioView node={children.studio} frame={frame} />
      <Saved text={model.saved} />
    </section>
  )),
  NotFound: page(({ state }, go) => (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold text-destructive">
        404 - Page Not Found
      </h1>
      <p className="text-muted-foreground">
        The path “{state.path}” was not found.
      </p>
      <Link to="/" onNavigate={go} className="text-primary hover:underline">
        ← Go Home
      </Link>
    </section>
  )),
});

const Saved = ({ text }: { readonly text: string | null }) =>
  text === null ? (
    <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
  ) : (
    <div className="rounded-lg border p-4">
      <h2 className="text-xs font-medium text-muted-foreground uppercase">
        Last saved draft
      </h2>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
