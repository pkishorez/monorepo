import { useState } from 'react';
import type { ReactNode } from 'react';
import { JsonViewer } from 'kui-toolkit/components/blocks/json';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'kui-toolkit/components/ui/dialog';
import { ScrollArea } from 'kui-toolkit/components/ui/scroll-area';
import { Braces, ExternalLink } from 'kui-toolkit/lucide';
import { isHttpUrl, type KeyValue, type Scalar } from './key-values.ts';

export type KeyValueGroup = { title?: string; rows: ReadonlyArray<KeyValue> };

function Cell({ value }: { value: Scalar }) {
  if (isHttpUrl(value))
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full items-start gap-1 underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
      >
        <span className="[overflow-wrap:anywhere]">{value}</span>
        <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
      </a>
    );
  const text =
    value === null ? '—' : typeof value === 'boolean' ? String(value) : value;
  return <span className="[overflow-wrap:anywhere]">{text}</span>;
}

/** Two columns, no chrome. Group titles render as muted rows inside the same table. */
export function KeyValueTable({
  groups,
  empty,
}: {
  groups: ReadonlyArray<KeyValueGroup>;
  empty: string;
}) {
  const filled = groups.filter((group) => group.rows.length > 0);
  if (filled.length === 0)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ScrollArea className="max-h-[60dvh] rounded-md border">
      <table className="w-full table-fixed text-left text-sm">
        <tbody>
          {filled.map((group, index) => (
            <Rows key={group.title ?? index} group={group} />
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function Rows({ group }: { group: KeyValueGroup }) {
  return (
    <>
      {group.title && (
        <tr className="bg-muted/40">
          <th
            colSpan={2}
            scope="colgroup"
            className="px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            {group.title}
          </th>
        </tr>
      )}
      {group.rows.map((row) => (
        <tr key={row.key} className="border-t border-border/70">
          <th
            scope="row"
            className="w-[35%] max-w-[12rem] truncate px-3 py-2 align-top font-mono text-xs font-normal text-muted-foreground"
            title={row.key}
          >
            {row.key}
          </th>
          <td className="px-3 py-2 align-top font-mono text-xs tabular-nums">
            <Cell value={row.value} />
          </td>
        </tr>
      ))}
    </>
  );
}

export function JsonButton({
  title,
  value,
  label,
}: {
  title: string;
  value: unknown;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        <Braces />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{title}</DialogTitle>
            <DialogDescription>Masked JSON.</DialogDescription>
          </DialogHeader>
          <JsonViewer value={value} label="JSON" maxHeight="65dvh" />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SectionHeading({
  id,
  title,
  count,
  action,
}: {
  id: string;
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {count !== undefined && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}
