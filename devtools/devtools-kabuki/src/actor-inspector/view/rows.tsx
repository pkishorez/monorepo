import { useState } from 'react';
import { BracesIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { BeforeAfter, Field, Job, Kind } from '../logic/shared/index.ts';
import { Picker } from './picker.tsx';
import { JsonDialog, Value } from './shared/index.ts';

export const TONE: Record<Kind, string> = {
  same: 'hover:bg-muted',
  added:
    'rounded-l-none bg-added/10 shadow-[inset_2px_0_0_var(--color-added)] hover:bg-added/20',
  changed:
    'rounded-l-none bg-changed/12 shadow-[inset_2px_0_0_var(--color-changed)] hover:bg-changed/24',
  removed:
    'rounded-l-none bg-removed/8 shadow-[inset_2px_0_0_var(--color-removed)] hover:bg-removed/16',
};

const pairOf = (field: Field): BeforeAfter =>
  field.kind === 'removed'
    ? { before: field.value }
    : field.kind === 'changed'
      ? { before: field.before, after: field.value }
      : { after: field.value };

export const wholeOf = (fields: ReadonlyArray<Field>): BeforeAfter => {
  const after = Object.fromEntries(
    fields
      .filter(({ kind }) => kind !== 'removed')
      .map(({ key, value }) => [key, value]),
  );
  if (fields.every(({ kind }) => kind === 'same')) return { after };
  const before = Object.fromEntries(
    fields
      .filter(({ kind }) => kind !== 'added')
      .map((field) => [
        field.key,
        field.kind === 'changed' ? field.before : field.value,
      ]),
  );
  return { before, after };
};

function FieldRow({
  field,
  title,
  compared,
}: {
  readonly field: Field;
  readonly title: string;
  readonly compared: boolean;
}) {
  const [flippedAt, setFlippedAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const changed = field.kind === 'changed';
  const change = changed ? JSON.stringify([field.before, field.value]) : '';
  const flipped = flippedAt === change;
  const showing = changed && compared !== flipped;
  return (
    <div className="group/row relative -mx-1.5 min-w-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (changed) setFlippedAt(flipped ? null : change);
          else setOpen(true);
        }}
        aria-expanded={changed ? showing : undefined}
        title={
          changed
            ? showing
              ? 'Hide what it was'
              : 'Changed in this Step. Show what it was'
            : 'Open as JSON'
        }
        className={cn(
          'flex min-h-6 w-full min-w-0 cursor-pointer items-start gap-3 rounded-sm px-1.5 py-0.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
          changed && 'pr-7',
          TONE[field.kind],
        )}
      >
        <span
          title={field.key}
          className={cn(
            'w-24 shrink-0 truncate text-muted-foreground',
            field.kind === 'removed' && 'line-through',
          )}
        >
          {field.key}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <Value
            still
            value={field.value}
            label={field.key}
            className={cn(field.kind === 'removed' && 'text-muted-foreground')}
          />
          {showing && (
            <span className="flex min-w-0 items-baseline gap-1.5 text-muted-foreground">
              <span className="shrink-0 text-[11px]">was</span>
              <Value
                still
                value={field.before}
                label={field.key}
                className="line-through decoration-muted-foreground/50"
              />
            </span>
          )}
        </span>
      </button>
      {changed && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
          aria-label={`Open ${field.key} as JSON`}
          title="Open as JSON"
          className="absolute top-0.5 right-1 flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-[opacity,background-color] duration-150 outline-none group-hover/row:opacity-100 hover:bg-background/60 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none touch:opacity-100"
        >
          <BracesIcon aria-hidden className="size-3" />
        </button>
      )}
      <JsonDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        pair={pairOf(field)}
      />
    </div>
  );
}

export function Fields({
  fields,
  scope,
  title,
  compared,
}: {
  readonly fields: ReadonlyArray<Field>;
  readonly scope: string;
  readonly title: string;
  readonly compared: boolean;
}) {
  return fields.map((field) => (
    <FieldRow
      key={field.key}
      field={field}
      title={`${title} · ${scope}.${field.key}`}
      compared={compared}
    />
  ));
}

const howOf = (job: Job) => {
  const keys = job.keys.filter(({ mark }) => mark !== 'stopped');
  if (job.runs !== 'each' && keys.length === 0) return job.runs ?? '';
  return keys.length === 1 ? `each · ${keys[0]!.key}` : `each · ${keys.length}`;
};

export function Jobs({
  jobs,
  state,
}: {
  readonly jobs: ReadonlyArray<Job>;
  readonly state?: string;
}) {
  return jobs.map((job) => (
    <div
      key={job.name}
      data-sending={job.sending || undefined}
      className={cn(
        '-mx-1.5 flex min-w-0 items-baseline gap-2 rounded-sm px-1.5 py-px',
        job.sending
          ? 'rounded-l-none bg-running/10 shadow-[inset_2px_0_0_var(--color-running)]'
          : job.mark === 'started'
            ? TONE.added
            : job.mark === 'stopped'
              ? TONE.removed
              : '',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 shrink-0 translate-y-[-1px] self-center rounded-full',
          job.mark === 'stopped'
            ? 'bg-removed'
            : job.mark === 'started'
              ? 'bg-added'
              : 'bg-muted-foreground/40',
        )}
      />
      <span
        className={cn(
          'min-w-0 truncate',
          job.mark === 'stopped' && 'text-muted-foreground line-through',
        )}
      >
        {job.name}
      </span>
      {job.keys.length > 1 ? (
        <Picker
          trigger={
            <button
              type="button"
              title="See every key it runs for"
              className="-mx-1 flex min-w-0 cursor-pointer items-center gap-0.5 rounded-sm px-1 text-muted-foreground transition-colors duration-150 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            />
          }
          label={
            <>
              <span className="truncate">
                {howOf(job)}
                {state && ` · in ${state}`}
              </span>
              <ChevronDownIcon aria-hidden className="size-3 shrink-0" />
            </>
          }
          placeholder={`Find a key of ${job.name}`}
          items={job.keys.map(({ key, mark }) => ({
            id: key,
            name: key,
            hint: mark ?? 'running',
            checked: false,
          }))}
        />
      ) : (
        <span className="min-w-0 truncate text-muted-foreground">
          {howOf(job)}
          {state && ` · in ${state}`}
        </span>
      )}
      {job.sending && (
        <span className="ml-auto shrink-0 text-running">sent</span>
      )}
    </div>
  ));
}
