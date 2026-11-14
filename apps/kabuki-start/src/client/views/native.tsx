import type { ReactNode } from 'react';
import { View } from '@kestack/kabuki/react';
import type { ViewProps } from '@kestack/kabuki/react/types';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Pages } from '../../shared/pages/index.ts';
import { PageIntro } from '../components/index.ts';

/*
 * What the app runs as, then three haptics to try, each saying whether the
 * device took it, then a Live Activity to start, move on and end. Every value sits alone in an element marked with
 * `data-proof`, so a native build's check reads it as it is shown. With
 * `proof` in the query, `data-proof="done"` says when the page has logged
 * its proof line.
 */

type Self = ViewProps<typeof Pages.NativeLive>;
type Model = Self['model'];
type Kind = keyof Model['results'];

const HAPTICS: ReadonlyArray<{
  readonly kind: Kind;
  readonly title: string;
  readonly what: string;
}> = [
  { kind: 'impact', title: 'Impact', what: 'One medium tap.' },
  { kind: 'notify', title: 'Notify', what: 'Something went well.' },
  { kind: 'selection', title: 'Selection', what: 'One step through a list.' },
];

function Label({ children }: { readonly children: ReactNode }) {
  return (
    <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/** One fact: its name, and its value alone in the element the proof reads. */
function Fact({
  name,
  proof,
  value,
}: {
  readonly name: string;
  readonly proof: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-muted-foreground">{name}</dt>
      <dd data-proof={proof} className="font-mono text-[13px] break-all">
        {value}
      </dd>
    </div>
  );
}

function RunsAs({ model }: { readonly model: Model }) {
  const { app } = model;
  const shell = (field: 'id' | 'name' | 'version' | 'build') =>
    app._tag === 'Checking' ? 'checking' : (app.shell?.[field] ?? 'none');
  return (
    <section
      aria-label="What it runs as"
      className="rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border px-5 py-4">
        <h2 className="font-semibold">What it runs as</h2>
      </header>
      <dl className="divide-y divide-border">
        <Fact
          name="Platform"
          proof="platform"
          value={app._tag === 'Checking' ? 'checking' : app.platform}
        />
        <Fact name="Shell id" proof="shell-id" value={shell('id')} />
        <Fact name="Shell name" proof="shell-name" value={shell('name')} />
        <Fact
          name="Shell version"
          proof="shell-version"
          value={shell('version')}
        />
        <Fact name="Shell build" proof="shell-build" value={shell('build')} />
        <Fact
          name="Service worker"
          proof="service-worker"
          value={model.serviceWorker}
        />
      </dl>
    </section>
  );
}

function Buzzes({
  model,
  send,
}: {
  readonly model: Model;
  readonly send: Self['send'];
}) {
  return (
    <section
      aria-label="Haptics"
      className="rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border px-5 py-4">
        <h2 className="font-semibold">Haptics</h2>
      </header>
      <div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
        {HAPTICS.map(({ kind, title, what }) => (
          <div key={kind} className="flex flex-col gap-4 p-5">
            <div className="space-y-1">
              <Label>{title}</Label>
              <p className="text-sm text-muted-foreground">{what}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Device:{' '}
              <span
                data-proof={`buzz-${kind}-result`}
                className="font-mono text-[13px] text-foreground"
              >
                {model.results[kind]}
              </span>
            </p>
            <Button
              data-proof={`buzz-${kind}`}
              variant="outline"
              size="sm"
              className="mt-auto self-start"
              onClick={() => send({ _tag: 'Buzz', kind })}
            >
              Buzz
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Live({
  model,
  send,
}: {
  readonly model: Model;
  readonly send: Self['send'];
}) {
  const { live } = model;
  const running = live.state === 'running';
  return (
    <section
      aria-label="Live Activity"
      className="rounded-xl border border-border bg-card"
    >
      <header className="space-y-1 border-b border-border px-5 py-4">
        <h2 className="font-semibold">Live Activity</h2>
        <p className="text-sm text-muted-foreground">
          A live card on the Lock Screen and in the Dynamic Island, on iOS.
        </p>
      </header>
      <dl className="divide-y divide-border">
        <Fact name="Supported" proof="live-supported" value={live.supported} />
        <Fact name="State" proof="live-state" value={live.state} />
        <Fact name="Id" proof="live-id" value={live.id ?? 'none'} />
        <Fact
          name="Progress"
          proof="live-progress"
          value={`${Math.round(live.progress * 100)}%`}
        />
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-border p-5">
        <Button
          data-proof="live-start"
          variant="outline"
          size="sm"
          disabled={live.supported !== 'yes' || running}
          onClick={() => send({ _tag: 'LiveStart' })}
        >
          Start
        </Button>
        <Button
          data-proof="live-update"
          variant="outline"
          size="sm"
          disabled={!running || live.progress >= 1}
          onClick={() => send({ _tag: 'LiveUpdate' })}
        >
          Update +25%
        </Button>
        <Button
          data-proof="live-end"
          variant="outline"
          size="sm"
          disabled={!running}
          onClick={() => send({ _tag: 'LiveEnd' })}
        >
          End
        </Button>
      </div>
    </section>
  );
}

export const NativeView = View.make(
  Pages.NativeLive,
  ({ root, model, props, send }) => (
    <div {...root} className="space-y-6">
      <PageIntro title="Native">
        The same page in a browser and in the app on iOS and Android. It says
        what it runs as; buzz each haptic to feel which the device takes, and
        start a Live Activity where iOS can show one.
      </PageIntro>
      <RunsAs model={model} />
      <Buzzes model={model} send={send} />
      <Live model={model} send={send} />
      {props.query.proof !== undefined && (
        <p className="text-sm text-muted-foreground">
          Proof logged:{' '}
          <span data-proof="done" className="font-mono text-[13px]">
            {model.proof === 'done' ? 'yes' : 'no'}
          </span>
        </p>
      )}
    </div>
  ),
);
