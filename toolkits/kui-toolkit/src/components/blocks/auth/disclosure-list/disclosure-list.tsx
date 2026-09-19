import type { ReactNode } from 'react';

import { Accordion } from '@base-ui/react/accordion';
import { ChevronDown } from 'lucide-react';

export function DisclosureList({
  open,
  onOpenChange,
  children,
}: {
  open: string | null;
  onOpenChange: (value: string | null) => void;
  children: ReactNode;
}) {
  return (
    <Accordion.Root
      multiple={false}
      value={open ? [open] : []}
      onValueChange={(values) =>
        onOpenChange((values[0] as string | undefined) ?? null)
      }
      className="flex flex-col rounded-lg ring-1 ring-foreground/10"
    >
      {children}
    </Accordion.Root>
  );
}

interface RowProps {
  icon: ReactNode;
  title: ReactNode;
  titleHint?: string | undefined;
  aside?: ReactNode;
}

const DETAILS = 'flex flex-col gap-4 px-3.5 pt-1 pb-4 sm:pl-10.5';

function RowSummary({ icon, title, titleHint, aside }: RowProps) {
  return (
    <>
      <span
        aria-hidden
        className="flex size-4 shrink-0 text-muted-foreground [&_svg]:size-4"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="min-w-0 truncate sm:flex-1" title={titleHint}>
          {title}
        </span>
        {aside ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {aside}
          </span>
        ) : null}
      </span>
    </>
  );
}

export function OpenRow({
  children,
  ...row
}: RowProps & { children: ReactNode }) {
  return (
    <div className="rounded-lg ring-1 ring-foreground/10">
      <div className="flex min-w-0 items-center gap-3 px-3.5 py-3 text-sm">
        <RowSummary {...row} />
      </div>
      <div className={DETAILS}>{children}</div>
    </div>
  );
}

export function DisclosureItem({
  value,
  children,
  ...row
}: RowProps & { value: string; children: ReactNode }) {
  const { icon, title, titleHint, aside } = row;
  return (
    <Accordion.Item
      value={value}
      className="not-last:border-b not-last:border-border/60"
    >
      <Accordion.Header className="flex">
        <Accordion.Trigger className="group flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left text-sm outline-none transition-colors duration-150 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          <RowSummary
            icon={icon}
            title={title}
            titleHint={titleHint}
            aside={aside}
          />
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel className="h-(--accordion-panel-height) overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
        <div className={DETAILS}>{children}</div>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

export function DetailList({
  details,
}: {
  details: ReadonlyArray<readonly [label: string, value: ReactNode]>;
}) {
  return (
    <dl className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6 sm:gap-y-1.5">
      {details.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5 sm:contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
