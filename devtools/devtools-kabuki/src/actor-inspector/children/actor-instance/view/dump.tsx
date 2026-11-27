import type { ReactNode } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { Value } from '../../../view/shared/index.ts';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function Dump({
  value,
  scope,
  depth = 0,
}: {
  readonly value: unknown;
  readonly scope: string;
  readonly depth?: number;
}) {
  const entries = isRecord(value)
    ? Object.entries(value).filter(([name]) => name !== '_tag')
    : [];
  if (entries.length === 0)
    return <p className="text-[13px] text-muted-foreground">Nothing</p>;
  return (
    <div
      className={cn(
        'flex flex-col',
        depth > 0 && 'border-l border-border pl-3',
      )}
    >
      {entries.map(([name, one]) =>
        isRecord(one) && depth < 1 && Object.keys(one).length <= 6 ? (
          <div key={name} className="flex flex-col py-0.5">
            <span className="text-[13px] leading-6 text-muted-foreground">
              {name}
            </span>
            <Dump value={one} scope={`${scope}.${name}`} depth={depth + 1} />
          </div>
        ) : (
          <div
            key={name}
            className="grid grid-cols-[minmax(5rem,auto)_minmax(0,1fr)] items-baseline gap-x-3 text-[13px] leading-6"
          >
            <span className="truncate text-muted-foreground">{name}</span>
            <span className="flex min-w-0">
              <Value value={one} label={`${scope}.${name}`} />
            </span>
          </div>
        ),
      )}
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}
