import type { Pointer } from '@kstackz/use-gesture';
import { motion, useTransform } from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type ReactNode, useState } from 'react';
import {
  type Entry,
  fingerName,
  type Part,
  type Run,
  useLab,
  zoneTagOf,
} from './store.ts';
import { ZONE_COLORS } from './zone.tsx';

export function ZoneChip(props: {
  readonly label: string;
  readonly name?: string;
  readonly color: string;
}) {
  return (
    <span
      style={{ backgroundColor: props.color }}
      className="inline-flex items-center rounded px-1 py-px align-baseline font-mono text-[11px] font-semibold whitespace-nowrap text-white"
    >
      {props.label}
      {props.name === undefined ? null : ` · ${props.name}`}
    </span>
  );
}

export function FingerChip(props: {
  readonly name: string;
  readonly color?: string;
}) {
  return (
    <span
      style={
        props.color === undefined
          ? undefined
          : { backgroundColor: props.color, borderColor: props.color }
      }
      className={cn(
        'inline-flex size-5 items-center justify-center rounded-full border-2 align-middle font-mono text-[10px] font-bold',
        props.color === undefined
          ? 'border-dashed border-muted-foreground text-foreground'
          : 'text-white',
      )}
    >
      {props.name}
    </span>
  );
}

const PartView = (props: { readonly part: Part }) => {
  const { part } = props;
  if (typeof part === 'string') return <>{part}</>;
  if ('zone' in part) {
    return (
      <ZoneChip
        label={part.zone.label}
        name={part.zone.name}
        color={part.zone.color}
      />
    );
  }
  return <FingerChip name={part.finger} color={part.color} />;
};

function Line(props: { readonly entry: Entry }) {
  return (
    <p className="grid grid-cols-[3.5rem_1fr] gap-2 py-1 text-[13px] leading-relaxed">
      <span className="pt-px text-right font-mono text-[11px] text-muted-foreground tabular-nums">
        {props.entry.at === undefined ? '' : `+${props.entry.at}ms`}
      </span>
      <span data-line-text="" className="text-pretty">
        {props.entry.parts.map((part, i) => (
          <PartView key={i} part={part} />
        ))}
      </span>
    </p>
  );
}

function Num(props: { readonly value: Pointer['dx'] }) {
  const rounded = useTransform(props.value, (v) => Math.round(v));
  return <motion.span>{rounded}</motion.span>;
}

function FingerRow(props: { readonly run: Run; readonly pointer: Pointer }) {
  const { run, pointer } = props;
  const zone = zoneTagOf(pointer.target);
  return (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-2">
        <FingerChip name={fingerName(run, pointer)} color={zone?.color} />
      </td>
      <td className="pr-2">
        {zone === undefined ? (
          <span className="text-muted-foreground">outside</span>
        ) : (
          <ZoneChip label={zone.label} color={zone.color} />
        )}
      </td>
      <td className="pr-2 text-right">+{Math.round(pointer.start.t)}</td>
      <td className="pr-2 text-right">
        <Num value={pointer.dx} />
      </td>
      <td className="pr-2 text-right">
        <Num value={pointer.dy} />
      </td>
      <td
        className={cn(
          'truncate',
          pointer.end !== undefined && 'text-muted-foreground',
        )}
      >
        {pointer.end === undefined
          ? 'down'
          : `lifted +${Math.round(pointer.end.t)}`}
      </td>
    </tr>
  );
}

const STATE_TEXT: Record<Run['state'], string> = {
  active: 'under way',
  ended: 'ended',
  interrupted: 'interrupted',
};

function Fingers() {
  const { runs } = useLab();
  if (runs.size === 0) {
    return <Empty>Touch a zone. Each finger of the Gesture shows here.</Empty>;
  }
  return (
    <div className="flex flex-col gap-4">
      {[...runs.values()].map((run) => (
        <div key={run.key}>
          <p className="text-xs text-muted-foreground">
            {run.lane === '' ? 'Gesture' : `Provider ${run.lane}’s Gesture`} #
            {run.key}:{' '}
            <b className="inline-block min-w-[11ch] text-foreground">
              {STATE_TEXT[run.state]}
            </b>
            . Heard by{' '}
            {run.heard.length === 0 ? 'no hook' : run.heard.join(', ')}.
          </p>
          <table className="mt-1 w-full table-fixed font-mono text-xs tabular-nums">
            <colgroup>
              <col className="w-9" />
              <col className="w-16" />
              <col className="w-16" />
              <col className="w-14" />
              <col className="w-14" />
              <col />
            </colgroup>
            <thead className="text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">#</th>
                <th className="font-normal">landed</th>
                <th className="pr-2 text-right font-normal">start.t</th>
                <th className="pr-2 text-right font-normal">dx</th>
                <th className="pr-2 text-right font-normal">dy</th>
                <th className="font-normal">state</th>
              </tr>
            </thead>
            <tbody>
              {[...run.pointers.values()].map((pointer) => (
                <FingerRow
                  key={`${run.key}-${pointer.id}`}
                  run={run}
                  pointer={pointer}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Log() {
  const { log } = useLab();
  if (log.length === 0) return <Empty>Nothing yet. Touch a zone.</Empty>;
  return (
    <div className="flex flex-col">
      {log.map((entry, i) => (
        <div
          key={entry.key}
          className={cn(
            i > 0 &&
              log[i - 1]?.run !== entry.run &&
              'mt-1 border-t border-border pt-1',
          )}
        >
          <Line entry={entry} />
        </div>
      ))}
    </div>
  );
}

const Empty = (props: { readonly children: ReactNode }) => (
  <p className="py-6 text-center text-sm text-muted-foreground">
    {props.children}
  </p>
);

/** The same marks in every Case, once, in words. */
export function Legend() {
  const [sky, amber] = ZONE_COLORS;
  return (
    <dl className="grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2 [&_dd]:text-muted-foreground [&_dt]:flex [&_dt]:items-center [&_dt]:gap-1.5">
      <div>
        <dt>
          <ZoneChip label="Z1" name="name" color={sky} />
        </dt>
        <dd>
          A zone, numbered, in its own color. Dashed until its hook hears a
          Gesture; tinted while it hears one; solid if it heard the last.
        </dd>
      </div>
      <div>
        <dt>
          <FingerChip name="1" color={amber} />
          <FingerChip name="2" color={sky} />
        </dt>
        <dd>
          A finger, numbered in the order it landed and filled with the color of
          the zone it landed in. Finger 1 has a ring: it decided who hears.
        </dd>
      </div>
      <div>
        <dt>
          <FingerChip name="3" />
        </dt>
        <dd>
          Dashed and empty: it landed outside every zone, yet joined the
          Gesture.
        </dd>
      </div>
      <div>
        <dt>
          <span className="inline-flex size-5 items-center justify-center rounded-full border-2 bg-background font-mono text-[10px] font-bold">
            2
          </span>{' '}
          lifted
        </dt>
        <dd>
          Lifted: it stays in the Gesture, frozen where it lifted, until the
          last finger lifts. A faded set of fingers is the last Gesture.
        </dd>
      </div>
      <div>
        <dt>
          <FingerChip name="×" />
        </dt>
        <dd>A finger no Gesture took; the log says why.</dd>
      </div>
      <div>
        <dt className="font-mono text-xs">header · this panel</dt>
        <dd>
          Marked <code>data-zone-gesture="disabled"</code>, so they work while a
          Gesture runs. Anywhere else, a finger would join the Gesture.
        </dd>
      </div>
      <div>
        <dt className="font-mono text-xs">line · dot</dt>
        <dd>
          The dot is where a finger landed; the line runs to where it is, so its
          length is dx, dy.
        </dd>
      </div>
    </dl>
  );
}

export type Guide = {
  readonly try: ReadonlyArray<ReactNode>;
  readonly expect: ReadonlyArray<ReactNode>;
};

function GuideView(props: {
  readonly guide: Guide;
  readonly legend: ReactNode | undefined;
}) {
  return (
    <div className="flex flex-col gap-4 text-[13px] leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs">
      <section>
        <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Try
        </h3>
        <ol className="list-decimal space-y-1 pl-5">
          {props.guide.try.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>
      <section>
        <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          What happens
        </h3>
        <ul className="space-y-1">
          {props.guide.expect.map((item, i) => (
            <li key={i} className="grid grid-cols-[1rem_1fr]">
              <span aria-hidden="true" className="text-muted-foreground">
                →
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Reading the marks
        </h3>
        {props.legend ?? <Legend />}
      </section>
    </div>
  );
}

const TABS = ['Guide', 'Fingers', 'Log'] as const;
type Tab = (typeof TABS)[number];

/**
 * Under the stage: the latest log line always, then the Case's guide, the
 * Gesture's fingers with their values, or the whole log.
 */
export function Panel(props: {
  readonly guide: Guide;
  readonly legend?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('Guide');
  const { log } = useLab();
  const [latest] = log;
  return (
    <section
      aria-label="What happened"
      data-zone-gesture="disabled"
      className="flex h-[40%] min-h-48 shrink-0 flex-col border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <div
        data-testid="gestures-latest"
        className="h-15 shrink-0 overflow-hidden border-b border-border bg-muted/40 px-3 [&_[data-line-text]]:line-clamp-2"
      >
        {latest === undefined ? (
          <p className="py-2.5 text-[13px] text-muted-foreground">
            The latest event shows here.
          </p>
        ) : (
          <div
            key={latest.key}
            className="animate-in duration-150 fade-in-0 motion-reduce:animate-none"
          >
            <Line entry={latest} />
          </div>
        )}
      </div>
      <div role="tablist" className="flex gap-1 px-2 pt-2">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={cn(
              'h-8 rounded-md px-3 text-sm font-medium text-muted-foreground',
              tab === name && 'bg-muted text-foreground',
            )}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2 [scrollbar-gutter:stable]"
      >
        {tab === 'Guide' ? (
          <GuideView guide={props.guide} legend={props.legend} />
        ) : null}
        {tab === 'Fingers' ? <Fingers /> : null}
        {tab === 'Log' ? <Log /> : null}
      </div>
    </section>
  );
}
