import { useState } from 'react';
import type { ReactNode } from 'react';
import { BracesIcon } from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { Card as Shown, Field } from '../logic/shared/index.ts';
import { JsonDialog } from './shared/index.ts';
import { Fields, Jobs, wholeOf } from './rows.tsx';

const HEADING =
  'text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground/80 uppercase';

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1 border-t border-border px-3 pt-2 pb-2.5 transition-colors duration-150 hover:bg-muted/30 motion-reduce:transition-none">
      <h4 className={HEADING}>{title}</h4>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function FieldSection({
  title,
  fields,
  scope,
  card,
  compared,
}: {
  readonly title: string;
  readonly fields: ReadonlyArray<Field>;
  readonly scope: string;
  readonly card: string;
  readonly compared: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="group/section flex flex-col gap-1 border-t border-border px-3 pt-1.5 pb-2.5 transition-colors duration-150 hover:bg-muted/30 motion-reduce:transition-none">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        title={`Open ${title.toLowerCase()} as JSON`}
        className="-mx-1.5 flex h-6 cursor-pointer items-center justify-between rounded-sm px-1.5 text-left transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <span className={HEADING}>{title}</span>
        <BracesIcon
          aria-hidden
          className="size-3 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/section:opacity-100"
        />
      </button>
      <div className="flex flex-col">
        <Fields
          fields={fields}
          scope={scope}
          title={card}
          compared={compared}
        />
      </div>
      <JsonDialog
        open={open}
        onOpenChange={setOpen}
        title={`${card} · ${scope}`}
        pair={wholeOf(fields)}
      />
    </section>
  );
}

function Header({
  card,
  onOpen,
}: {
  readonly card: Shown;
  readonly onOpen: (address: string) => void;
}) {
  const { node } = card;
  return (
    <button
      type="button"
      disabled={card.ghost}
      onClick={() => onOpen(node.address)}
      title={
        card.ghost ? undefined : 'Open it whole, with the Messages it takes'
      }
      className="group/header flex w-full flex-col px-3 pt-2.5 pb-2 text-left transition-colors duration-150 outline-none enabled:cursor-pointer enabled:hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default motion-reduce:transition-none"
    >
      <span className="flex w-full min-w-0 items-baseline gap-2">
        <span
          className={cn(
            'min-w-0 truncate text-sm font-semibold text-foreground',
            card.ghost && 'text-muted-foreground line-through',
          )}
        >
          {card.name}
        </span>
        {card.type && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {card.type}
          </span>
        )}
        {node.key !== undefined && node.key !== '[]' && (
          <span
            title={node.key}
            className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
          >
            [{node.key}]
          </span>
        )}
        {card.added && (
          <span className="ml-auto shrink-0 text-xs font-medium text-added">
            New
          </span>
        )}
        {card.ghost && (
          <span className="ml-auto shrink-0 text-xs font-medium text-removed">
            Removed
          </span>
        )}
      </span>
    </button>
  );
}

const TAG =
  'inline-flex h-5 min-w-0 items-center rounded-md px-1.5 text-xs font-medium';

function StateSection({
  card,
  title,
  compared,
}: {
  readonly card: Shown;
  readonly title: string;
  readonly compared: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [flippedAt, setFlippedAt] = useState<string | null>(null);
  const { node, data, was } = card;
  const moved = was !== undefined;
  const change = `${was}\u0000${node.state}`;
  const flipped = flippedAt === change;
  const showing = moved && compared !== flipped;
  const tag = (
    <span
      className={cn(
        TAG,
        'truncate border',
        moved
          ? 'border-changed/50 bg-changed/12 text-foreground'
          : 'border-border bg-background text-foreground',
      )}
    >
      {node.state}
    </span>
  );
  return (
    <section className="group/section flex flex-col gap-1.5 border-t border-border bg-muted/40 px-3 pt-2 pb-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={HEADING}
          title="The State it is in. The fields under it belong to that State and go when it leaves."
        >
          State
        </span>
        {moved ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setFlippedAt(flipped ? null : change);
            }}
            aria-expanded={showing}
            title={
              showing
                ? 'Hide the State it left'
                : 'Changed in this Step. Show the State it left'
            }
            className="-mx-1 flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors duration-150 outline-none hover:bg-changed/12 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {showing && (
              <>
                <span className="truncate text-xs text-muted-foreground line-through decoration-muted-foreground/50">
                  {was}
                </span>
                <span aria-hidden className="text-xs text-muted-foreground">
                  →
                </span>
              </>
            )}
            {tag}
          </button>
        ) : (
          tag
        )}
        {data.length > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(true);
            }}
            aria-label={`Open ${node.state}'s fields as JSON`}
            title={`Open ${node.state}'s fields as JSON`}
            className="ml-auto flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-[opacity,background-color] duration-150 outline-none group-hover/section:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <BracesIcon aria-hidden className="size-3" />
          </button>
        )}
      </div>
      {data.length > 0 && (
        <div className="ml-1 flex flex-col border-l border-border pl-2.5">
          <Fields
            fields={data}
            scope="state"
            title={title}
            compared={compared}
          />
        </div>
      )}
      <JsonDialog
        open={open}
        onOpenChange={setOpen}
        title={`${title} · ${node.state}`}
        pair={wholeOf(data)}
      />
    </section>
  );
}

const some = (list: ReadonlyArray<unknown>) => list.length > 0;

const borderOf = (card: Shown) =>
  card.target
    ? 'border-running/70'
    : card.sent
      ? 'border-running/40'
      : card.added
        ? 'border-added/60'
        : card.ghost
          ? 'border-dashed border-removed/50'
          : card.changed
            ? 'border-changed/50'
            : 'border-border';

export function Card({
  card,
  compared,
  onOpen,
}: {
  readonly card: Shown;
  readonly compared: boolean;
  readonly onOpen: (address: string) => void;
}) {
  const title =
    card.node.key === undefined || card.node.key === '[]'
      ? card.name
      : `${card.name} [${card.node.key}]`;
  return (
    <article
      data-body
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-card text-[12.5px] leading-5 shadow-[0_1px_2px_rgb(0_0_0/0.08)]',
        borderOf(card),
        card.ghost && 'opacity-60',
      )}
    >
      <Header card={card} onOpen={onOpen} />
      {card.node.state !== 'Single' && (
        <StateSection card={card} title={title} compared={compared} />
      )}
      {some(card.model) && (
        <FieldSection
          title="Model"
          fields={card.model}
          scope="model"
          card={title}
          compared={compared}
        />
      )}
      {some(card.props) && (
        <FieldSection
          title="Props"
          fields={card.props}
          scope="props"
          card={title}
          compared={compared}
        />
      )}
      {(some(card.workers) || some(card.stateWorkers)) && (
        <Section title="Workers">
          <Jobs jobs={card.workers} />
          <Jobs jobs={card.stateWorkers} state={card.node.state} />
        </Section>
      )}
      {(some(card.always) || some(card.inState)) && (
        <Section title="Provides">
          {[...card.always, ...card.inState].map((name) => (
            <p key={name} className="truncate">
              {name}
              {card.inState.includes(name) && (
                <span className="text-muted-foreground">
                  {' '}
                  · in {card.node.state}
                </span>
              )}
            </p>
          ))}
        </Section>
      )}
    </article>
  );
}
