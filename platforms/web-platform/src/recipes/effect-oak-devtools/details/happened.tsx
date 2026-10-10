import type { ReactNode } from 'react';
import { ArrowRight } from '#lib/lucide';
import { JsonTree } from '../../../components/viewers/json/index.ts';
import { KIND_LABEL, payloadOf, seconds, touched } from '../step/index.ts';
import type { Kind, Row, Step } from '../step/index.ts';
import { Changes } from './changes.tsx';

/** How to name an Instance by its ID: its Actor, and its key if it has one. */
export type NameOf = (id: string) => string;

const SOURCE = {
  view: { name: 'View', means: 'From the UI' },
  command: { name: 'Command', means: 'From work an Update asked for' },
  lifetime: {
    name: 'Lifetime',
    means: 'From work that runs while in a State',
  },
} as const;

const BADGE: Record<Kind, string> = {
  init: 'bg-muted text-foreground',
  transition: 'bg-primary text-primary-foreground',
  update: 'bg-muted text-foreground',
  still: 'bg-muted text-muted-foreground',
  ignored: 'border border-dashed text-muted-foreground',
  dropped: 'border border-dashed text-muted-foreground',
};

/**
 * The Step at a glance: which Message, who Sent it where, what it carried,
 * and every change it made. Old values wait behind a hover.
 */
export const Happened = ({
  step,
  kind,
  rows,
  nameOf,
}: {
  readonly step: Step;
  readonly kind: Kind;
  /** Every Instance at the Step, or only the one picked. */
  readonly rows: ReadonlyArray<Row>;
  readonly nameOf: NameOf;
}) => {
  const entry = step === 'init' ? undefined : step;
  const changed = rows.filter(touched);
  const payload = entry ? payloadOf(entry.message) : {};
  const nothing = nothingOf(step, kind, nameOf);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[kind]}`}
          >
            {KIND_LABEL[kind]}
          </span>
          <span className="truncate text-[15px] font-semibold">
            {entry ? entry.message._tag : 'Init'}
          </span>
          <span className="flex-1" />
          <span
            className="font-mono text-xs text-muted-foreground tabular-nums"
            title="Time since the app started"
          >
            {seconds(entry?.at ?? 0)}
          </span>
        </div>
        {entry && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Chip title={SOURCE[entry.source.kind].means}>
              {entry.source.instance !== entry.instance && (
                <span className="font-medium">
                  {nameOf(entry.source.instance)}
                </span>
              )}
              <span className="text-muted-foreground">
                {SOURCE[entry.source.kind].name}
              </span>
            </Chip>
            <ArrowRight aria-label="to" className="size-3.5 text-primary" />
            <Chip>
              <span className="font-medium">{nameOf(entry.instance)}</span>
            </Chip>
          </div>
        )}
        {nothing && <p className="text-xs text-muted-foreground">{nothing}</p>}
      </div>

      {Object.keys(payload).length > 0 && (
        <Section title="Payload">
          <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs">
            <JsonTree value={payload} collapsed={false} tone="syntax" />
          </div>
        </Section>
      )}

      {changed.length > 0 && (
        <Section title={step === 'init' ? 'Started' : 'Changed'}>
          <Changes rows={changed} />
        </Section>
      )}
    </div>
  );
};

const Chip = ({
  title,
  children,
}: {
  readonly title?: string;
  readonly children: ReactNode;
}) => (
  <span
    title={title}
    className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5"
  >
    {children}
  </span>
);

const Section = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {title}
    </h3>
    {children}
  </section>
);

/** Why the Step changed nothing, when it didn't. */
const nothingOf = (step: Step, kind: Kind, nameOf: NameOf) => {
  if (step === 'init') return undefined;
  const target = nameOf(step.instance);
  switch (kind) {
    case 'ignored':
      return step.from === 'Single'
        ? `Nothing happened: ${target} has no rule for it.`
        : `Nothing happened: ${target} has no rule for it in ${step.from}.`;
    case 'dropped':
      return `Nothing happened: ${target} had already stopped.`;
    case 'still':
      return `${target} handled it, but its data stayed the same.`;
    default:
      return undefined;
  }
};
