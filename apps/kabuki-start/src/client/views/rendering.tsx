import type { ReactNode } from 'react';
import { View } from '@kestack/kabuki/react';
import type { Root } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import type { Status } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { RotateCwIcon } from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { Pages, router } from '../../shared/pages/index.ts';
import type { Place } from '../../shared/pages/index.ts';
import { PageIntro, clock } from '../components/index.ts';

/*
 * The three Render Modes as three layers, one inside the next. A layer the
 * URL names is live and says, from its `status.info`, who drew it, when
 * its Loader ran, how its data arrived and who it is kept for. A layer
 * the URL does not name is a dashed outline with a link that adds it.
 */

type Mode = 'static' | 'dynamic' | 'client';

const MODES: Record<
  Mode,
  { readonly name: string; readonly place: Place; readonly kept: string }
> = {
  static: {
    name: 'Static',
    place: 'Static',
    kept: 'Yes, for everyone',
  },
  dynamic: {
    name: 'Dynamic',
    place: 'Static.Dynamic',
    kept: 'No, drawn per visit',
  },
  client: {
    name: 'Client',
    place: 'Static.Dynamic.Client',
    kept: 'No, drawn in your browser',
  },
};

const ARRIVED = {
  server: 'In the HTML',
  browser: 'Fetched by the browser',
  cache: "From the browser's cache",
} as const;

const link =
  'text-sm font-medium underline decoration-border underline-offset-4 transition-colors duration-150 hover:decoration-foreground';

function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Whether the page is kept. Start keeps a whole page only when every layer
 * the server draws is static, so the static layer is kept alone at `/`,
 * and drawn afresh with the page once a dynamic layer is inside it.
 */
const keptOf = (mode: Mode, mixed: boolean) =>
  mode === 'static' && mixed
    ? 'No: a dynamic layer is inside it, so the page is drawn per visit'
    : MODES[mode].kept;

/** What a live layer says about itself. */
function Facts({
  mode,
  mixed,
  status,
}: {
  readonly mode: Mode;
  /** Whether a dynamic layer is drawn inside this one. */
  readonly mixed: boolean;
  readonly status: Status<{ readonly at: number }>;
}) {
  if (status._tag !== 'Ready')
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {status._tag === 'Loading' ? (
          <>
            <Spinner /> Sent without its data; the browser is loading it…
          </>
        ) : (
          `It broke: ${status.reason}`
        )}
      </p>
    );
  const { from, took } = status.info;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      <Fact label="Drawn by">
        {from === 'server' ? 'The server' : 'Your browser'}
      </Fact>
      <Fact label="Loader ran at">
        <span className="font-mono text-[13px] tabular-nums">
          {clock(status.data.at)}
        </span>
      </Fact>
      <Fact label="Data arrived">
        {ARRIVED[from]}
        {from === 'browser' && took !== null && (
          <span className="text-muted-foreground tabular-nums">
            {' '}
            · {took} ms
          </span>
        )}
      </Fact>
      <Fact label="Cached">{keptOf(mode, mixed)}</Fact>
    </dl>
  );
}

/** A layer the URL names: its name and path, what it says, and the layer inside it. */
function Live({
  root,
  mode,
  mixed = false,
  status,
  remove,
  children,
}: {
  /** The View's root, when the layer is the whole View. */
  readonly root?: Root;
  readonly mode: Mode;
  /** Whether a dynamic layer is drawn inside this one. */
  readonly mixed?: boolean;
  readonly status: Status<{ readonly at: number }>;
  /** A link that takes this layer away; none for the outermost. */
  readonly remove?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section
      {...(root ?? {})}
      className={`space-y-5 border border-border p-5 ${mode === 'static' ? 'rounded-xl bg-card' : mode === 'dynamic' ? 'rounded-lg bg-background' : 'rounded-md bg-card'}`}
    >
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="flex items-baseline gap-2.5">
          <span className="font-semibold">{MODES[mode].name}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {router.paths()[MODES[mode].place]}
          </span>
        </h2>
        {remove}
      </header>
      <Facts mode={mode} mixed={mixed} status={status} />
      {children}
    </section>
  );
}

/** A layer the URL does not name: an outline, and the link that adds it. */
function Ghost({
  mode,
  what,
  add,
}: {
  readonly mode: Mode;
  readonly what: string;
  readonly add: ReactNode;
}) {
  return (
    <section className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-dashed border-border p-5">
      <h2 className="flex items-baseline gap-2.5">
        <span className="font-semibold text-muted-foreground">
          {MODES[mode].name}
        </span>
        <span className="text-sm text-muted-foreground">{what}</span>
      </h2>
      {add}
    </section>
  );
}

const ClientView = View.make(Pages.ClientLive, ({ root, props }) => (
  <Live
    root={root}
    mode="client"
    status={props.status}
    remove={
      <Router.Link to={router.Static.Dynamic()} className={link}>
        Remove
      </Router.Link>
    }
  >
    {null}
  </Live>
));

const DynamicView = View.make(
  Pages.DynamicLive,
  ({ root, props, children }) => (
    <Live
      root={root}
      mode="dynamic"
      status={props.status}
      remove={
        <Router.Link to={router.Static()} className={link}>
          Remove
        </Router.Link>
      }
    >
      {children.Client ? (
        <ClientView instance={children.Client} />
      ) : (
        <Ghost
          mode="client"
          what="Sent empty, loaded by your browser."
          add={
            <Router.Link to={router.Static.Dynamic.Client()} className={link}>
              Add this layer
            </Router.Link>
          }
        />
      )}
    </Live>
  ),
);

export const StaticView = View.make(
  Pages.StaticLive,
  ({ root, props, children }) => (
    <div {...root} className="space-y-6">
      <PageIntro title="Rendering">
        One page can mix three Render Modes. Each layer below says who drew it
        and when; add the inner layers, then reload and watch the times.
      </PageIntro>
      <Live
        mode="static"
        mixed={Boolean(children.Dynamic)}
        status={props.status}
      >
        {children.Dynamic ? (
          <DynamicView instance={children.Dynamic} />
        ) : (
          <Ghost
            mode="dynamic"
            what="Drawn by the server on every visit."
            add={
              <Router.Link to={router.Static.Dynamic()} className={link}>
                Add this layer
              </Router.Link>
            }
          />
        )}
      </Live>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RotateCwIcon /> Reload the page
        </Button>
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          Reload and compare the times. Deployed, the page at{' '}
          <span className="font-mono text-[13px]">/</span> is kept whole, so its
          time stays; once a dynamic layer is in it, the whole page is drawn
          afresh, and in dev every page is.
        </p>
      </div>
    </div>
  ),
);
