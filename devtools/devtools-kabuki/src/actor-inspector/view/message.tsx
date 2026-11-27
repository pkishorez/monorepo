import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  ChevronRightIcon,
  MousePointerClickIcon,
  PlugIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { JsonViewer } from '@kestack/web-platform/ui/viewers/json';
import { instanceLabel } from '../logic/shared/index.ts';
import type {
  Effect,
  Field,
  From,
  Link,
  Played,
  Trace,
} from '../logic/shared/index.ts';
import { TONE } from './rows.tsx';
import { Value } from './shared/index.ts';

type Label = (address: string) => string;

const originOf = (from: From, label: Label): string => {
  switch (from.kind) {
    case 'view':
      return `Clicked in ${label(from.instance)}’s view`;
    case 'worker':
      return `Sent by the ${from.name}${from.key === undefined ? '' : ` [${from.key}]`} worker of ${label(from.instance)}`;
    case 'command':
      return `Answered by the ${from.name} command of ${label(from.instance)}`;
    case 'provides':
      return `Sent by a Capability ${label(from.instance)} provides`;
    case 'emit':
      return `Emitted ${from.name} by ${label(from.instance)}`;
    case 'outside':
      return from.name
        ? `Sent from outside: ${from.name}`
        : 'Sent from outside the app';
  }
};

const handOf = (from: From): string | null => {
  switch (from.kind) {
    case 'emit':
      return `emitted ${from.name}, which its parent turned into`;
    case 'command':
      return `asked the ${from.name} command, which answered with`;
    default:
      return null;
  }
};

const summaryOf = (payload: ReadonlyArray<Field>) => {
  const first = payload[0];
  if (!first) return null;
  const text = JSON.stringify(first.value) ?? String(first.value);
  return `${first.key} ${text}${payload.length > 1 ? ` +${payload.length - 1}` : ''}`;
};

const payloadOf = (message: unknown): Readonly<Record<string, unknown>> => {
  if (typeof message !== 'object' || message === null) return {};
  const { _tag: _, ...rest } = message as Readonly<Record<string, unknown>>;
  return rest;
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const OUTCOME = {
  handled: 'handled',
  ignored: 'ignored: no rule took it in this State',
  dropped: 'dropped: its Instance was gone',
} as const;

function Part({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Dot({ tone }: { readonly tone: 'origin' | 'past' | 'shown' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute top-[8px] left-[3px] size-[7px] rounded-full',
        tone === 'origin' && 'border border-muted-foreground/60 bg-background',
        tone === 'past' && 'bg-muted-foreground/60',
        tone === 'shown' && 'bg-running',
      )}
    />
  );
}

function Chain({
  chain,
  label,
  onStep,
}: {
  readonly chain: ReadonlyArray<Link>;
  readonly label: Label;
  readonly onStep: (id: number) => void;
}) {
  const rows = chain.flatMap((link, index) => {
    const hand = index > 0 ? handOf(link.from) : null;
    return [
      ...(hand
        ? [
            <li
              key={`${link.id}:hand`}
              className="pb-1 pl-5 text-xs text-muted-foreground"
            >
              {hand}
            </li>,
          ]
        : []),
      <li key={link.id} className="relative pb-1.5 pl-5">
        <Dot tone={link.shown ? 'shown' : 'past'} />
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px] leading-6">
          <span className="text-muted-foreground tabular-nums">#{link.id}</span>
          <span className="min-w-0 truncate">
            {label(link.to)} got{' '}
            <span className="font-semibold">{link.tag}</span>
          </span>
          {link.shown ? (
            <span className="text-xs text-running">this Step</span>
          ) : (
            <button
              type="button"
              onClick={() => onStep(link.id)}
              className="rounded-sm text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              Go to Step
            </button>
          )}
        </span>
      </li>,
    ];
  });
  return (
    <ol className="relative flex flex-col">
      <span
        aria-hidden
        className="absolute top-3 bottom-4 left-[6px] w-px bg-border"
      />
      <li className="relative pb-1.5 pl-5 text-[13px] leading-6 text-muted-foreground">
        <Dot tone="origin" />
        {originOf(chain[0]!.from, label)}
      </li>
      {rows}
    </ol>
  );
}

function Effects({
  effects,
  label,
}: {
  readonly effects: ReadonlyArray<Effect>;
  readonly label: Label;
}) {
  if (effects.length === 0)
    return <p className="text-[13px] text-muted-foreground">Nothing changed</p>;
  return (
    <div className="flex flex-col text-[13px] leading-6">
      {effects.map((effect) => (
        <div
          key={`${effect.instance}:${effect.path}`}
          className={cn(
            'flex min-w-0 items-baseline gap-2 rounded-sm px-2',
            TONE[effect.kind],
          )}
        >
          <span className="w-56 shrink-0 truncate text-muted-foreground">
            {label(effect.instance)}
            {effect.path && (
              <span className="text-foreground/80"> · {effect.path}</span>
            )}
          </span>
          {effect.path === '' ? (
            <span>{effect.kind === 'added' ? 'started' : 'stopped'}</span>
          ) : (
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
              {'before' in effect && (
                <Value
                  value={effect.before}
                  label={`${label(effect.instance)} · ${effect.path}`}
                  pair={effect}
                  className="max-w-[45%] text-muted-foreground line-through decoration-muted-foreground/50"
                />
              )}
              {'before' in effect && 'after' in effect && (
                <span aria-hidden className="text-muted-foreground">
                  →
                </span>
              )}
              {'after' in effect && (
                <Value
                  value={effect.after}
                  label={`${label(effect.instance)} · ${effect.path}`}
                  pair={effect}
                />
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Asked({
  message,
  label,
}: {
  readonly message: Played;
  readonly label: Label;
}) {
  const rows = [
    ...message.commands.map(({ name, args }, index) => ({
      key: `command:${index}:${name}`,
      what: `${name} command`,
      value: args,
      leads: null,
    })),
    ...message.emits.map(({ tag, payload, becomes }, index) => ({
      key: `emit:${index}:${tag}`,
      what: `emitted ${tag}`,
      value: payload,
      leads: becomes
        ? `${label(becomes.to)} gets ${becomes.tag}`
        : 'no parent hears it',
    })),
  ];
  if (rows.length === 0)
    return (
      <p className="text-[13px] text-muted-foreground">
        No Commands and no Emits
      </p>
    );
  return (
    <div className="flex flex-col text-[13px] leading-6">
      {rows.map((row) => (
        <div key={row.key} className="flex min-w-0 items-baseline gap-2 px-2">
          <span className="w-56 shrink-0 truncate">{row.what}</span>
          <Value value={row.value} label={row.what} />
          {row.leads && (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              → {row.leads}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function MessageDialog({
  trace,
  open,
  onOpenChange,
  onStep,
}: {
  readonly trace: Trace;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onStep: (id: number) => void;
}) {
  const { message, chain, effects } = trace;
  const payload = payloadOf(message.message);
  const label: Label = (address) => instanceLabel(address, trace.actors);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(44rem,calc(100dvh-2rem))] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-2 text-base">
            {message.tag}
            <span className="text-[13px] font-normal text-muted-foreground">
              → {label(message.to)}
            </span>
          </DialogTitle>
          <DialogDescription className="tabular-nums">
            Step #{message.id} · {OUTCOME[message.outcome]} · at{' '}
            {seconds(message.at)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-6">
          <Part title="How it got here">
            <Chain
              chain={chain}
              label={label}
              onStep={(id) => {
                onOpenChange(false);
                onStep(id);
              }}
            />
          </Part>
          <Part title="Payload">
            {Object.keys(payload).length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No payload</p>
            ) : (
              <JsonViewer
                label={message.tag}
                value={payload}
                maxHeight="40vh"
              />
            )}
          </Part>
          <Part title="What it changed">
            <Effects effects={effects} label={label} />
          </Part>
          <Part title="What it asked for">
            <Asked message={message} label={label} />
          </Part>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Chip({
  trace,
  payload,
  onStep,
}: {
  readonly trace: Trace;
  readonly payload: ReadonlyArray<Field>;
  readonly onStep: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const { message } = trace;
  const label: Label = (address) => instanceLabel(address, trace.actors);
  const took = message.outcome === 'handled';
  const Origin =
    message.from.kind === 'view'
      ? MousePointerClickIcon
      : message.from.kind === 'outside'
        ? PlugIcon
        : null;
  const summary = summaryOf(payload);
  return (
    <>
      <button
        type="button"
        data-band
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        title={`${originOf(message.from, label)}. Open the Message`}
        className={cn(
          'flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-full border bg-card px-2.5 text-xs shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
          took
            ? 'border-running/50 hover:bg-running/10'
            : 'border-dashed border-border text-muted-foreground hover:bg-muted',
        )}
      >
        {Origin ? (
          <Origin aria-hidden className="size-3.5 shrink-0 text-running" />
        ) : (
          <span
            aria-hidden
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              took ? 'bg-running' : 'bg-muted-foreground/60',
            )}
          />
        )}
        <span
          className={cn('shrink-0 font-semibold', took && 'text-foreground')}
        >
          {message.tag}
        </span>
        {summary && (
          <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
            {summary}
          </span>
        )}
        <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
          {took ? `#${message.id}` : message.outcome}
        </span>
        <ChevronRightIcon
          aria-hidden
          className="-mr-1 size-3.5 shrink-0 text-muted-foreground"
        />
      </button>
      <span aria-hidden className="ml-5 block h-2 w-px bg-running/50" />
      <MessageDialog
        trace={trace}
        open={open}
        onOpenChange={setOpen}
        onStep={onStep}
      />
    </>
  );
}
